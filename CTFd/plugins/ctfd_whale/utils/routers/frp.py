import warnings

from flask import current_app
from requests import session, RequestException

from CTFd.models import db
from CTFd.utils import get_config, set_config, logging

from .base import BaseRouter
from ..cache import CacheProvider
from ..db import DBContainer
from ..exceptions import WhaleError, WhaleWarning
from ...models import WhaleContainer

import CTFd.plugins.ctfd_owl.frp_utils

class FrpRouter(BaseRouter):
    name = "frp"
    types = {
        'direct': 'tcp',
        'http': 'http',
    }

    class FrpRule:
        def __init__(self, name, config):
            self.name = name
            self.config = config

        def __str__(self) -> str:
            return f'[{self.name}]\n' + '\n'.join(f'{k} = {v}' for k, v in self.config.items())

    def __init__(self):
        super().__init__()
        self.ses = session()
        self.url = get_config("whale:frp_api_url").rstrip("/")
        self.common = ''
        try:
            CacheProvider(app=current_app).init_port_sets()
        except Exception:
            warnings.warn(
                "cache initialization failed",
                WhaleWarning
            )

    def get_rule(self):
        rules = []
        for container in DBContainer.get_all_alive_container():
            name = f'{container.challenge.redirect_type}_{container.user_id}_{container.uuid}'
            config = {
                'type': self.types[container.challenge.redirect_type],
                'local_ip': f'{container.user_id}-{container.uuid}',
                'local_port': container.challenge.redirect_port,
                'use_compression': 'true',
            }
            if config['type'] == 'http':
                config['subdomain'] = container.http_subdomain
            elif config['type'] == 'tcp':
                config['remote_port'] = container.port
            rules.append(self.FrpRule(name, config))
        return '\n'.join(str(r) for r in rules)

    def reload(self):
        rules=self.get_rule();
        try:
            if not self.common:
                common = get_config("whale:frp_config_template", '')
                if '[common]' in common:
                    self.common = common
                else:
                    remote = self.ses.get(f'{self.url}/api/config')
                    assert remote.status_code == 200
                    set_config("whale:frp_config_template", remote.text)
                    self.common = remote.text
            config = self.common + '\n' + rules + FrpRouter().get_rule()
            assert self.ses.put(
                f'{self.url}/api/config', config, timeout=5
            ).status_code == 200
            assert self.ses.get(
                f'{self.url}/api/reload', timeout=5
            ).status_code == 200
        except (RequestException, AssertionError) as e:
            raise WhaleError(
                '\nfrpc request failed\n' +
                (f'{e}\n' if str(e) else '') +
                'please check the frp related configs'
            ) from None

    def access(self, container: WhaleContainer):
        if container.challenge.redirect_type == 'direct':
            return f'nc {get_config("whale:frp_direct_ip_address", "127.0.0.1")} {container.port}'
        elif container.challenge.redirect_type == 'http':
            host = get_config("whale:frp_http_domain_suffix", "")
            port = get_config("whale:frp_http_port", "80")
            host += f':{port}' if port != 80 else ''
            return f'<a target="_blank" href="http://{container.http_subdomain}.{host}/">Open Challenge</a>'
        return ''

    def register(self, container: WhaleContainer):
        from CTFd.utils import get_config
        import docker

        # --- Tạo container Docker thực tế ---
        client = docker.DockerClient(base_url=get_config("whale:docker_api_url", "unix:///var/run/docker.sock"))
        image = container.challenge.docker_image
        name = f"whale_{container.user_id}_{container.challenge_id}_{container.uuid[:8]}"
        network = get_config("whale:docker_network", "ctfd_containers")
        mem_limit = container.challenge.memory_limit or "128m"
        cpu_limit = container.challenge.cpu_limit or 0.5

        try:
            real_container = client.containers.run(
                image=image,
                name=name,
                network=network,
                mem_limit=mem_limit,
                nano_cpus=int(float(cpu_limit) * 1e9),
                detach=True,
                remove=False,
            )
            container.docker_id = real_container.id
            db.session.commit()
            current_app.logger.info(f"[Whale] Container created: {real_container.id}")
        except Exception as e:
            current_app.logger.error(f"[Whale] Docker error: {e}")
            return False, f'Docker error: {e}'

        # --- Xử lý port và FRP (giữ nguyên) ---
        if container.challenge.redirect_type == 'direct':
            if not container.port:
                port = CacheProvider(app=current_app).get_available_port()
                if not port:
                    # Rollback: xóa container vừa tạo
                    try:
                        client.containers.get(container.docker_id).remove(force=True)
                    except:
                        pass
                    return False, 'No available ports. Please wait for a few minutes.'
                container.port = port
                db.session.commit()
        elif container.challenge.redirect_type == 'http':
            pass

        # --- Cập nhật FRP ---
        try:
            self.reload()
        except Exception as e:
            # Nếu reload FRP thất bại, hủy container
            try:
                client.containers.get(container.docker_id).remove(force=True)
            except:
                pass
            return False, f'FRP reload failed: {e}'

        return True, 'success'
    
    def unregister(self, container: WhaleContainer):
        from CTFd.utils import get_config
        import docker

        # --- Xóa container Docker thực tế ---
        client = docker.DockerClient(base_url=get_config("whale:docker_api_url", "unix:///var/run/docker.sock"))
        if container.docker_id:
            try:
                real_container = client.containers.get(container.docker_id)
                real_container.remove(force=True)
                current_app.logger.info(f"[Whale] Container removed: {container.docker_id}")
            except Exception as e:
                current_app.logger.warning(f"[Whale] Could not remove container: {e}")

        # --- Trả lại port cho pool (nếu là direct) ---
        if container.challenge.redirect_type == 'direct' and container.port:
            try:
                redis_util = CacheProvider(app=current_app)
                redis_util.add_available_port(container.port)
            except Exception as e:
                current_app.logger.warning(f"[Whale] Could not return port {container.port}: {e}")

        # --- Cập nhật lại FRP ---
        try:
            self.reload()
        except Exception as e:
            current_app.logger.error(f"[Whale] FRP reload failed during unregister: {e}")
            return False, f'FRP reload failed: {e}'

        return True, 'success'

    def check_availability(self):
        try:
            resp = self.ses.get(f'{self.url}/api/status')
        except RequestException as e:
            return False, 'Unable to access frpc admin api'
        if resp.status_code == 401:
            return False, 'frpc admin api unauthorized'
        return True, 'Available'

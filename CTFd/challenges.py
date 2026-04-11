from datetime import datetime

from flask import Blueprint, redirect, render_template, request, url_for
from sqlalchemy.orm import joinedload

from CTFd.constants.config import ChallengeVisibilityTypes, Configs
from CTFd.models import Challenges, Solves
from CTFd.utils.config import is_teams_mode
from CTFd.utils.dates import ctf_ended, ctf_paused, ctf_started
from CTFd.utils.decorators import (
    during_ctf_time_only,
    require_complete_profile,
    require_verified_emails,
)
from CTFd.utils.decorators.visibility import (
    check_account_visibility,
    check_challenge_visibility,
    check_score_visibility,
)
from CTFd.utils.helpers import get_errors, get_infos
from CTFd.utils.user import authed, get_current_team

challenges = Blueprint("challenges", __name__)


def _check_challenge_access():
    if (
        Configs.challenge_visibility == ChallengeVisibilityTypes.PUBLIC
        and authed() is False
    ):
        return None

    if is_teams_mode() and get_current_team() is None:
        return redirect(url_for("teams.private", next=request.full_path))

    return None


def _get_challenge_messages():
    infos = get_infos()
    errors = get_errors()

    if Configs.challenge_visibility == ChallengeVisibilityTypes.ADMINS:
        infos.append("Challenge Visibility is set to Admins Only")

    if ctf_started() is False:
        errors.append(f"{Configs.ctf_name} has not started yet")

    if ctf_paused() is True:
        infos.append(f"{Configs.ctf_name} is paused")

    if ctf_ended() is True:
        infos.append(f"{Configs.ctf_name} has ended")

    return infos, errors


def _humanize_solve_time(date_value):
    if date_value is None:
        return "-"

    delta = datetime.utcnow() - date_value
    total_seconds = max(int(delta.total_seconds()), 0)

    if total_seconds < 10:
        return "a few seconds ago"
    if total_seconds < 60:
        return f"{total_seconds} seconds ago"

    minutes = total_seconds // 60
    if minutes < 60:
        return f"{minutes} minute ago" if minutes == 1 else f"{minutes} minutes ago"

    hours = minutes // 60
    if hours < 24:
        return f"{hours} hour ago" if hours == 1 else f"{hours} hours ago"

    days = hours // 24
    if days < 30:
        return f"{days} day ago" if days == 1 else f"{days} days ago"

    return date_value.strftime("%Y-%m-%d %H:%M:%S UTC")


@challenges.route("/challenges", methods=["GET"])
@require_complete_profile
@during_ctf_time_only
@require_verified_emails
@check_challenge_visibility
def listing():
    redirect_response = _check_challenge_access()
    if redirect_response:
        return redirect_response

    infos, errors = _get_challenge_messages()

    return render_template("challenges.html", infos=infos, errors=errors)


@challenges.route("/challenges/new", methods=["GET"])
@require_complete_profile
@during_ctf_time_only
@require_verified_emails
@check_challenge_visibility
def new_challenges():
    redirect_response = _check_challenge_access()
    if redirect_response:
        return redirect_response

    infos, errors = _get_challenge_messages()
    rows = (
        Challenges.query.with_entities(
            Challenges.id,
            Challenges.name,
            Challenges.category,
        )
        .filter_by(state="visible")
        .order_by(Challenges.id.desc())
        .all()
    )

    return render_template(
        "new_challenges.html",
        infos=infos,
        errors=errors,
        challenge_rows=rows,
    )


@challenges.route("/challenges/new-solves", methods=["GET"])
@require_complete_profile
@during_ctf_time_only
@require_verified_emails
@check_challenge_visibility
@check_account_visibility
@check_score_visibility
def new_solves():
    redirect_response = _check_challenge_access()
    if redirect_response:
        return redirect_response

    infos, errors = _get_challenge_messages()

    page = max(request.args.get("page", 1, type=int), 1)
    per_page = 50

    solve_query = (
        Solves.query.options(
            joinedload(Solves.user),
            joinedload(Solves.challenge),
        )
        .join(Challenges, Solves.challenge_id == Challenges.id)
        .filter(Challenges.state == "visible")
        .order_by(Solves.id.desc())
    )
    pagination = solve_query.paginate(page=page, per_page=per_page, error_out=False)

    first_index = pagination.total - ((pagination.page - 1) * per_page)
    solve_rows = []
    for offset, solve in enumerate(pagination.items):
        solve_rows.append(
            {
                "index": first_index - offset,
                "id": solve.id,
                "user_id": solve.user.id if solve.user else None,
                "user": solve.user.name if solve.user else "Unknown",
                "challenge": solve.challenge.name if solve.challenge else "Unknown",
                "time_ago": _humanize_solve_time(solve.date),
            }
        )

    total_pages = max(pagination.pages, 1)
    page_start = max(1, pagination.page - 2)
    page_end = min(total_pages, pagination.page + 2)

    return render_template(
        "new_solves.html",
        infos=infos,
        errors=errors,
        solve_rows=solve_rows,
        page=pagination.page,
        total_pages=total_pages,
        page_start=page_start,
        page_end=page_end,
    )

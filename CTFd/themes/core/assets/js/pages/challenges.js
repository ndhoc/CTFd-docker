import "./main";
import "bootstrap/js/dist/tab";
import { ezQuery, ezAlert } from "../ezq";
import { htmlEntities } from "../utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import $ from "jquery";
import CTFd from "../CTFd";
import config from "../config";
import hljs from "highlight.js";

dayjs.extend(relativeTime);

CTFd._internal.challenge = {};
let challenges = [];
let solves = [];
const CHALLENGES_PER_PAGE = 28;
let currentPage = 1;
let selectedCategory = "all";
let filteredChallenges = [];

const loadChal = id => {
  const chal = $.grep(challenges, chal => chal.id == id)[0];

  if (chal.type === "hidden") {
    ezAlert({
      title: "Challenge Hidden!",
      body: "You haven't unlocked this challenge yet!",
      button: "Got it!"
    });
    return;
  }

  displayChal(chal);
};

const loadChalByName = name => {
  let idx = name.lastIndexOf("-");
  let pieces = [name.slice(0, idx), name.slice(idx + 1)];
  let id = pieces[1];

  const chal = $.grep(challenges, chal => chal.id == id)[0];
  displayChal(chal);
};

const displayChal = chal => {
  return Promise.all([
    CTFd.api.get_challenge({ challengeId: chal.id }),
    $.getScript(config.urlRoot + chal.script),
    $.get(config.urlRoot + chal.template)
  ]).then(responses => {
    const challenge = CTFd._internal.challenge;

    $("#challenge-window").empty();

    // Inject challenge data into the plugin
    challenge.data = responses[0].data;

    // Call preRender function in plugin
    challenge.preRender();

    // Build HTML from the Jinja response in API
    $("#challenge-window").append(responses[0].data.view);

    $("#challenge-window #challenge-input").addClass("form-control");
    $("#challenge-window #challenge-submit").addClass(
      "btn btn-md btn-outline-secondary float-right"
    );

    let modal = $("#challenge-window").find(".modal-dialog");
    if (
      window.init.theme_settings &&
      window.init.theme_settings.challenge_window_size
    ) {
      switch (window.init.theme_settings.challenge_window_size) {
        case "sm":
          modal.addClass("modal-sm");
          break;
        case "lg":
          modal.addClass("modal-lg");
          break;
        case "xl":
          modal.addClass("modal-xl");
          break;
        default:
          break;
      }
    }

    $(".challenge-solves").click(function(_event) {
      getSolves($("#challenge-id").val());
    });
    $(".nav-tabs a").click(function(event) {
      event.preventDefault();
      $(this).tab("show");
    });

    // Handle modal toggling
    $("#challenge-window").on("hide.bs.modal", function(_event) {
      $("#challenge-input").removeClass("wrong");
      $("#challenge-input").removeClass("correct");
      $("#incorrect-key").slideUp();
      $("#correct-key").slideUp();
      $("#already-solved").slideUp();
      $("#too-fast").slideUp();
    });

    $(".load-hint").on("click", function(_event) {
      loadHint($(this).data("hint-id"));
    });

    $("#challenge-submit").click(function(event) {
      event.preventDefault();
      $("#challenge-submit").addClass("disabled-button");
      $("#challenge-submit").prop("disabled", true);
      CTFd._internal.challenge
        .submit()
        .then(renderSubmissionResponse)
        .then(loadChals)
        .then(markSolves);
    });

    $("#challenge-input").keyup(event => {
      if (event.keyCode == 13) {
        $("#challenge-submit").click();
      }
    });

    challenge.postRender();

    $("#challenge-window")
      .find("pre code")
      .each(function(_idx) {
        hljs.highlightBlock(this);
      });

    window.location.replace(
      window.location.href.split("#")[0] + `#${chal.name}-${chal.id}`
    );
    $("#challenge-window").modal();
  });
};

function renderSubmissionResponse(response) {
  const result = response.data;

  const result_message = $("#result-message");
  const result_notification = $("#result-notification");
  const answer_input = $("#challenge-input");
  result_notification.removeClass();
  result_message.text(result.message);

  const next_btn = $(
    `<div class='col-md-12 pb-3'><button class='btn btn-info w-100'>Next Challenge</button></div>`
  ).click(function() {
    $("#challenge-window").modal("toggle");
    setTimeout(function() {
      loadChal(CTFd._internal.challenge.data.next_id);
    }, 500);
  });

  if (result.status === "authentication_required") {
    window.location =
      CTFd.config.urlRoot +
      "/login?next=" +
      CTFd.config.urlRoot +
      window.location.pathname +
      window.location.hash;
    return;
  } else if (result.status === "incorrect") {
    // Incorrect key
    result_notification.addClass(
      "alert alert-danger alert-dismissable text-center"
    );
    result_notification.slideDown();

    answer_input.removeClass("correct");
    answer_input.addClass("wrong");
    setTimeout(function() {
      answer_input.removeClass("wrong");
    }, 3000);
  } else if (result.status === "correct") {
    // Challenge Solved
    result_notification.addClass(
      "alert alert-success alert-dismissable text-center"
    );
    result_notification.slideDown();

    if (
      $(".challenge-solves")
        .text()
        .trim()
    ) {
      // Only try to increment solves if the text isn't hidden
      $(".challenge-solves").text(
        parseInt(
          $(".challenge-solves")
            .text()
            .split(" ")[0]
        ) +
          1 +
          " Solves"
      );
    }

    answer_input.val("");
    answer_input.removeClass("wrong");
    answer_input.addClass("correct");

    if (CTFd._internal.challenge.data.next_id) {
      $(".submit-row").html(next_btn);
    }
  } else if (result.status === "already_solved") {
    // Challenge already solved
    result_notification.addClass(
      "alert alert-info alert-dismissable text-center"
    );
    result_notification.slideDown();

    answer_input.addClass("correct");

    if (CTFd._internal.challenge.data.next_id) {
      $(".submit-row").html(next_btn);
    }
  } else if (result.status === "paused") {
    // CTF is paused
    result_notification.addClass(
      "alert alert-warning alert-dismissable text-center"
    );
    result_notification.slideDown();
  } else if (result.status === "ratelimited") {
    // Keys per minute too high
    result_notification.addClass(
      "alert alert-warning alert-dismissable text-center"
    );
    result_notification.slideDown();

    answer_input.addClass("too-fast");
    setTimeout(function() {
      answer_input.removeClass("too-fast");
    }, 3000);
  }
  setTimeout(function() {
    $(".alert").slideUp();
    $("#challenge-submit").removeClass("disabled-button");
    $("#challenge-submit").prop("disabled", false);
  }, 3000);
}

function markSolves() {
  challenges.map(challenge => {
    if (challenge.solved_by_me) {
      const btn = $(`button[value="${challenge.id}"]`);
      btn.addClass("solved-challenge");
      btn.prepend("<i class='fas fa-check corner-button-check'></i>");
    }
  });
}

function getSolves(id) {
  return CTFd.api.get_challenge_solves({ challengeId: id }).then(response => {
    const data = response.data;
    $(".challenge-solves").text(parseInt(data.length) + " Solves");
    const box = $("#challenge-solves-names");
    box.empty();
    for (let i = 0; i < data.length; i++) {
      const id = data[i].account_id;
      const name = data[i].name;
      const date = dayjs(data[i].date).fromNow();
      const account_url = data[i].account_url;
      box.append(
        '<tr><td><a href="{0}">{2}</td><td>{3}</td></tr>'.format(
          account_url,
          id,
          htmlEntities(name),
          date
        )
      );
    }
  });
}

function loadChals() {
  return CTFd.api.get_challenge_list().then(function(response) {
    challenges = response.data;

    if (window.BETA_sortChallenges) {
      challenges = window.BETA_sortChallenges(challenges);
    }

    if (window.location.hash.length > 0) {
      loadChalByName(decodeURIComponent(window.location.hash.substring(1)));
    }

    renderBoard();

    $("#challenge-loading").addClass("d-none");
    $("#challenges-board").removeClass("d-none");
  });
}

function normalizeValue(value) {
  if (!value) {
    return "";
  }
  return String(value).toLowerCase();
}

function getCategories() {
  const unique = [];
  challenges.forEach(challenge => {
    if ($.inArray(challenge.category, unique) === -1) {
      unique.push(challenge.category);
    }
  });
  return unique;
}

function getSearchFieldValue(challenge, field) {
  if (field === "description") {
    return normalizeValue(challenge.description);
  }
  if (field === "tag") {
    return normalizeValue(
      (challenge.tags || [])
        .map(tag => tag.value)
        .join(" ")
    );
  }
  return normalizeValue(challenge.name);
}

function applyFilters() {
  const field = $("#challenge-search-field").val() || "name";
  const query = normalizeValue($("#challenge-search-input").val().trim());

  filteredChallenges = challenges.filter(challenge => {
    if (selectedCategory !== "all" && challenge.category !== selectedCategory) {
      return false;
    }

    if (!query) {
      return true;
    }

    return getSearchFieldValue(challenge, field).indexOf(query) !== -1;
  });

  const maxPage = Math.max(1, Math.ceil(filteredChallenges.length / CHALLENGES_PER_PAGE));
  if (currentPage > maxPage) {
    currentPage = maxPage;
  }
}

function renderCategories() {
  const $categories = $("#challenge-categories");
  $categories.empty();

  const allClass = selectedCategory === "all" ? "active" : "";
  $categories.append(
    $(
      "<button class='nav-link challenge-category-item " + allClass + "' data-category='all'>All</button>"
    )
  );

  getCategories().forEach(category => {
    const activeClass = selectedCategory === category ? "active" : "";
    const button = $(
      "<button class='nav-link challenge-category-item " +
        activeClass +
        "' data-category='" +
        htmlEntities(category) +
        "'></button>"
    );
    button.text(category);
    $categories.append(button);
  });
}

function renderChallenges() {
  const $grid = $("#challenge-grid");
  const $empty = $("#challenge-empty");
  $grid.empty();

  if (!filteredChallenges.length) {
    $empty.removeClass("d-none");
    return;
  }

  $empty.addClass("d-none");

  const start = (currentPage - 1) * CHALLENGES_PER_PAGE;
  const pageChallenges = filteredChallenges.slice(start, start + CHALLENGES_PER_PAGE);

  pageChallenges.forEach(challenge => {
    const solved = challenge.solved_by_me || solves.indexOf(challenge.id) !== -1;
    const classes = solved
      ? "btn btn-dark challenge-button challenge-tile solved-challenge w-100"
      : "btn btn-dark challenge-button challenge-tile w-100";

    const wrapper = $("<div class='col-6 col-md-4 col-lg-3 mb-3'></div>");
    const button = $(
      "<button class='" + classes + "' value='" + challenge.id + "'></button>"
    );

    if (solved) {
      button.append("<i class='fas fa-check corner-button-check'></i>");
    }

    button.append(
      $(
        "<div class='challenge-tile-inner'><p class='challenge-title mb-2'></p><span class='challenge-value'></span></div>"
      )
    );
    button.find(".challenge-title").text(challenge.name);
    button.find(".challenge-value").text(challenge.value);

    wrapper.append(button);
    $grid.append(wrapper);
  });

  $(".challenge-button").off("click").on("click", function(_event) {
    loadChal(this.value);
  });
}

function renderPagination() {
  const $pagination = $("#challenge-pagination");
  $pagination.empty();

  const pageCount = Math.ceil(filteredChallenges.length / CHALLENGES_PER_PAGE);
  if (pageCount <= 1) {
    return;
  }

  for (let page = 1; page <= pageCount; page++) {
    const active = page === currentPage ? " active" : "";
    const item = $(
      "<li class='page-item" + active + "'><button class='page-link challenge-page' data-page='" + page + "'>" + page + "</button></li>"
    );
    $pagination.append(item);
  }
}

function renderBoard() {
  applyFilters();
  renderCategories();
  renderChallenges();
  renderPagination();
}

function update() {
  return loadChals();
}

$(() => {
  $("#challenges-board").addClass("d-none");
  update();

  $("#challenge-search-button").on("click", function() {
    currentPage = 1;
    renderBoard();
  });

  $("#challenge-search-input").on("keyup", function(event) {
    if (event.keyCode === 13) {
      currentPage = 1;
      renderBoard();
    }
  });

  $("#challenge-search-field").on("change", function() {
    currentPage = 1;
    renderBoard();
  });

  $(document).on("click", ".challenge-category-item", function() {
    selectedCategory = $(this).data("category") || "all";
    currentPage = 1;
    renderBoard();
  });

  $(document).on("click", ".challenge-page", function() {
    currentPage = parseInt($(this).data("page"), 10) || 1;
    renderChallenges();
    renderPagination();
  });

  $("#challenge-input").keyup(function(event) {
    if (event.keyCode == 13) {
      $("#challenge-submit").click();
    }
  });

  $(".nav-tabs a").click(function(event) {
    event.preventDefault();
    $(this).tab("show");
  });

  $("#challenge-window").on("hidden.bs.modal", function(_event) {
    $(".nav-tabs a:first").tab("show");
    history.replaceState("", window.document.title, window.location.pathname);
  });

  $(".challenge-solves").click(function(_event) {
    getSolves($("#challenge-id").val());
  });

  $("#challenge-window").on("hide.bs.modal", function(_event) {
    $("#challenge-input").removeClass("wrong");
    $("#challenge-input").removeClass("correct");
    $("#incorrect-key").slideUp();
    $("#correct-key").slideUp();
    $("#already-solved").slideUp();
    $("#too-fast").slideUp();
  });
});
setInterval(update, 300000); // Update every 5 minutes.

const displayHint = data => {
  ezAlert({
    title: "Hint",
    body: data.html,
    button: "Got it!"
  });
};

const displayUnlock = id => {
  ezQuery({
    title: "Unlock Hint?",
    body: "Are you sure you want to open this hint?",
    success: () => {
      const params = {
        target: id,
        type: "hints"
      };
      CTFd.api.post_unlock_list({}, params).then(response => {
        if (response.success) {
          CTFd.api.get_hint({ hintId: id }).then(response => {
            displayHint(response.data);
          });

          return;
        }

        ezAlert({
          title: "Error",
          body: response.errors.score,
          button: "Got it!"
        });
      });
    }
  });
};

const loadHint = id => {
  CTFd.api.get_hint({ hintId: id }).then(response => {
    if (!response.success) {
      let msg = Object.values(response.errors).join("\n");
      alert(msg);
      return;
    }
    if (response.data.content) {
      displayHint(response.data);
      return;
    }

    displayUnlock(id);
  });
};

window.updateChallengeBoard = update;

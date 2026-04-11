(function() {
  var $ = window.jQuery || window.$;
  if (!$) {
    if (window.console && window.console.error) {
      console.error("Challenge board dependencies missing", {
        hasjQuery: !!window.jQuery,
        hasDollar: !!window.$
      });
    }
    var loading = document.getElementById("challenge-loading");
    var board = document.getElementById("challenges-board");
    var empty = document.getElementById("challenge-empty");
    if (loading) {
      loading.classList.add("d-none");
    }
    if (board) {
      board.classList.remove("d-none");
    }
    if (empty) {
      empty.classList.remove("d-none");
      empty.textContent = "Challenge board dependencies failed to load.";
    }
    return;
  }

  var CTFd = window.CTFd || null;

  CTFd._internal = CTFd._internal || {};
  CTFd._internal.challenge = CTFd._internal.challenge || {};

  var challenges = [];
  var CHALLENGES_PER_PAGE = 28;
  var currentPage = 1;
  var selectedCategory = "all";
  var selectedSort = "rank";
  var filteredChallenges = [];

  function htmlEntities(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatRelativeTime(value) {
    if (!value) {
      return "-";
    }

    var date = new Date(value);
    if (isNaN(date.getTime())) {
      return "-";
    }

    var diffMs = Date.now() - date.getTime();
    if (diffMs < 0) {
      diffMs = 0;
    }

    var minute = 60 * 1000;
    var hour = 60 * minute;
    var day = 24 * hour;
    var year = 365 * day;

    if (diffMs < minute) {
      return "just now";
    }
    if (diffMs < hour) {
      var minutes = Math.floor(diffMs / minute);
      return minutes === 1 ? "a minute ago" : minutes + " minutes ago";
    }
    if (diffMs < day) {
      var hours = Math.floor(diffMs / hour);
      return hours === 1 ? "an hour ago" : hours + " hours ago";
    }
    if (diffMs < year) {
      var days = Math.floor(diffMs / day);
      return days === 1 ? "a day ago" : days + " days ago";
    }

    var years = Math.floor(diffMs / year);
    return years === 1 ? "a year ago" : years + " years ago";
  }

  function getChallengeById(id) {
    for (var i = 0; i < challenges.length; i++) {
      if (String(challenges[i].id) === String(id)) {
        return challenges[i];
      }
    }
    return null;
  }

  function loadChal(id) {
    if (!CTFd || !CTFd.api) {
      alert("Challenge details are not ready yet. Please refresh and try again.");
      return;
    }

    var chal = getChallengeById(id);
    if (!chal) {
      return;
    }

    if (chal.type === "hidden") {
      alert("Challenge Hidden! You have not unlocked this challenge yet.");
      return;
    }

    return displayChal(chal);
  }

  function loadChalByName(name) {
    var idx = name.lastIndexOf("-");
    if (idx < 0) {
      return;
    }
    loadChal(name.slice(idx + 1));
  }

  function getCategories() {
    var unique = [];
    for (var i = 0; i < challenges.length; i++) {
      var category = challenges[i].category;
      if ($.inArray(category, unique) === -1) {
        unique.push(category);
      }
    }
    return unique;
  }

  function getSearchFieldValue(challenge, field) {
    if (field === "description") {
      return String(challenge.description || "").toLowerCase();
    }
    if (field === "tag") {
      var tags = challenge.tags || [];
      return tags
        .map(function(tag) {
          return tag.value;
        })
        .join(" ")
        .toLowerCase();
    }
    return String(challenge.name || "").toLowerCase();
  }

  function applyFilters() {
    var field = $("#challenge-search-field").val() || "name";
    var query = String($("#challenge-search-input").val() || "")
      .trim()
      .toLowerCase();

    filteredChallenges = challenges.filter(function(challenge) {
      if (selectedCategory !== "all" && challenge.category !== selectedCategory) {
        return false;
      }
      if (!query) {
        return true;
      }
      return getSearchFieldValue(challenge, field).indexOf(query) !== -1;
    });

    filteredChallenges.sort(function(a, b) {
      if (selectedSort === "name_asc") {
        return String(a.name || "").localeCompare(String(b.name || ""));
      }
      if (selectedSort === "name_desc") {
        return String(b.name || "").localeCompare(String(a.name || ""));
      }
      if (selectedSort === "value_asc") {
        return Number(a.value || 0) - Number(b.value || 0);
      }
      if (selectedSort === "value_desc") {
        return Number(b.value || 0) - Number(a.value || 0);
      }
      return Number(b.solves || 0) - Number(a.solves || 0);
    });

    var maxPage = Math.max(1, Math.ceil(filteredChallenges.length / CHALLENGES_PER_PAGE));
    if (currentPage > maxPage) {
      currentPage = maxPage;
    }
  }

  function renderCategories() {
    var $categories = $("#challenge-categories");
    $categories.empty();

    var allClass = selectedCategory === "all" ? "active" : "";
    $categories.append(
      "<button class='nav-link challenge-category-item " + allClass + "' data-category='all'>All</button>"
    );

    getCategories().forEach(function(category) {
      var activeClass = selectedCategory === category ? "active" : "";
      $categories.append(
        "<button class='nav-link challenge-category-item " +
          activeClass +
          "' data-category='" +
          htmlEntities(category) +
          "'>" +
          htmlEntities(category) +
          "</button>"
      );
    });
  }

  function renderChallenges() {
    var $grid = $("#challenge-grid");
    var $empty = $("#challenge-empty");
    $grid.empty();

    if (!filteredChallenges.length) {
      $empty.removeClass("d-none");
      return;
    }

    $empty.addClass("d-none");

    var start = (currentPage - 1) * CHALLENGES_PER_PAGE;
    var end = start + CHALLENGES_PER_PAGE;
    var pageChallenges = filteredChallenges.slice(start, end);

    pageChallenges.forEach(function(challenge) {
      var solved = !!challenge.solved_by_me;
      var solvedClass = solved ? " solved-challenge" : "";
      var checkIcon = solved ? "<i class='fas fa-check corner-button-check'></i>" : "";

      $grid.append(
        "<div class='challenge-cell'>" +
          "<button class='btn btn-dark challenge-button challenge-tile" +
          solvedClass +
          "' value='" +
          challenge.id +
          "'>" +
          checkIcon +
          "<div class='challenge-tile-inner'>" +
          "<p class='challenge-title mb-2'>" +
          htmlEntities(challenge.name) +
          "</p>" +
          "<div class='challenge-solves-count' data-challenge-id='" +
          challenge.id +
          "'>" +
          htmlEntities(challenge.solves || 0) +
          " Solves</div>" +
          "<span class='challenge-value'>" +
          htmlEntities(challenge.value) +
          " Points</span>" +
          "</div></button></div>"
      );
    });

    $(".challenge-button").off("click").on("click", function() {
      loadChal(this.value);
    });
  }

  function renderPagination() {
    var $pagination = $("#challenge-pagination");
    $pagination.empty();

    var pageCount = Math.ceil(filteredChallenges.length / CHALLENGES_PER_PAGE);
    if (pageCount <= 1) {
      return;
    }

    function addNav(label, targetPage, disabled, extraClass) {
      var liClass = "page-item " + (extraClass || "") + (disabled ? " disabled" : "");
      var pageAttr = disabled ? "" : " data-page='" + targetPage + "'";
      var btnClass = "page-link challenge-page" + (disabled ? " challenge-page-disabled" : "");
      $pagination.append(
        "<li class='" +
          liClass.trim() +
          "'><button class='" +
          btnClass +
          "'" +
          pageAttr +
          ">" +
          label +
          "</button></li>"
      );
    }

    function addPage(page) {
      var active = page === currentPage ? " active" : "";
      $pagination.append(
        "<li class='page-item" +
          active +
          "'><button class='page-link challenge-page' data-page='" +
          page +
          "'>" +
          page +
          "</button></li>"
      );
    }

    function addEllipsis() {
      $pagination.append("<li class='page-item disabled'><span class='page-link'>...</span></li>");
    }

    addNav("First", 1, currentPage === 1, "first");
    addNav("Prev", currentPage - 1, currentPage === 1, "prev");

    var pages = [];
    pages.push(1);

    for (var p = currentPage - 1; p <= currentPage + 1; p++) {
      if (p > 1 && p < pageCount) {
        pages.push(p);
      }
    }

    if (pageCount > 1) {
      pages.push(pageCount);
    }

    pages = pages.filter(function(value, index, arr) {
      return arr.indexOf(value) === index;
    });
    pages.sort(function(a, b) {
      return a - b;
    });

    for (var i = 0; i < pages.length; i++) {
      if (i > 0 && pages[i] - pages[i - 1] > 1) {
        addEllipsis();
      }
      addPage(pages[i]);
    }

    addNav("Next", currentPage + 1, currentPage === pageCount, "next");
    addNav("Last", pageCount, currentPage === pageCount, "last");
  }

  function renderBoard() {
    $("#challenge-current-category").text(selectedCategory === "all" ? "All" : selectedCategory);
    applyFilters();
    renderCategories();
    renderChallenges();
    renderPagination();
  }

  function getSolves(id) {
    if (!CTFd || !CTFd.api) {
      return Promise.resolve();
    }

    return CTFd.api.get_challenge_solves({ challengeId: id }).then(function(response) {
      var data = [];
      if (response && Array.isArray(response.data)) {
        data = response.data;
      } else if (response && response.data && Array.isArray(response.data.data)) {
        data = response.data.data;
      }

      $(".challenge-solves").text(parseInt(data.length, 10) + " Solves");
      var box = $("#challenge-window #challenge-solves-names");
      if (!box.length) {
        box = $("#challenge-window #challenge-solves-body");
      }
      if (!box.length) {
        box = $("#challenge-window #solves tbody").first();
      }
      box.empty();

      if (!data.length) {
        box.append("<tr><td colspan='2'>No solves yet</td></tr>");
        return;
      }

      for (var i = 0; i < data.length; i++) {
        var item = data[i];
        var name = item.name || item.account_name || item.user_name || "Unknown";
        var url = item.account_url || item.user_url || "#";
        var date = formatRelativeTime(item.date || item.created || "");
        box.append(
          "<tr><td><a href='" +
            htmlEntities(url) +
            "'>" +
            htmlEntities(name) +
            "</a></td><td>" +
            htmlEntities(date) +
            "</td></tr>"
        );
      }
    }).catch(function() {
      var box = $("#challenge-window #challenge-solves-names");
      if (!box.length) {
        box = $("#challenge-window #challenge-solves-body");
      }
      if (!box.length) {
        box = $("#challenge-window #solves tbody").first();
      }
      box.empty().append("<tr><td colspan='2'>Unable to load solves</td></tr>");
    });
  }

  function renderSubmissionResponse(response) {
    if (!CTFd) {
      return;
    }

    var result = response.data;
    var resultMessage = $("#result-message");
    var resultNotification = $("#result-notification");
    var answerInput = $("#challenge-input");

    resultNotification.removeClass();
    resultMessage.text(result.message);

    if (result.status === "authentication_required") {
      window.location =
        CTFd.config.urlRoot +
        "/login?next=" +
        CTFd.config.urlRoot +
        window.location.pathname +
        window.location.hash;
      return;
    }

    if (result.status === "incorrect") {
      resultNotification.addClass("alert alert-danger alert-dismissable text-center");
      answerInput.removeClass("correct").addClass("wrong");
      setTimeout(function() {
        answerInput.removeClass("wrong");
      }, 3000);
    } else if (result.status === "correct") {
      resultNotification.addClass("alert alert-success alert-dismissable text-center");
      answerInput.val("").removeClass("wrong").addClass("correct");
    } else if (result.status === "already_solved") {
      resultNotification.addClass("alert alert-info alert-dismissable text-center");
      answerInput.addClass("correct");
    } else if (result.status === "paused" || result.status === "ratelimited") {
      resultNotification.addClass("alert alert-warning alert-dismissable text-center");
    }

    resultNotification.slideDown();

    setTimeout(function() {
      $(".alert").slideUp();
      $("#challenge-submit").removeClass("disabled-button").prop("disabled", false);
    }, 3000);
  }

  function loadHint(id) {
    if (!CTFd || !CTFd.api) {
      return;
    }

    CTFd.api.get_hint({ hintId: id }).then(function(response) {
      if (!response.success) {
        var msg = Object.values(response.errors).join("\n");
        alert(msg);
        return;
      }

      if (response.data.content) {
        alert(response.data.content);
      }
    });
  }

  function displayChal(chal) {
    if (!CTFd || !CTFd.api) {
      return Promise.resolve();
    }

    return Promise.all([
      CTFd.api.get_challenge({ challengeId: chal.id }),
      $.getScript((window.init.urlRoot || "") + chal.script),
      $.get((window.init.urlRoot || "") + chal.template)
    ]).then(function(responses) {
      var challenge = CTFd._internal.challenge;
      $("#challenge-window").empty();

      challenge.data = responses[0].data;
      if (challenge.preRender) {
        challenge.preRender();
      }

      $("#challenge-window").append(responses[0].data.view);
      $("#challenge-window #challenge-input").addClass("form-control");
      $("#challenge-window #challenge-submit").addClass("btn btn-md btn-outline-secondary float-right");

      $(".challenge-solves")
        .off("click")
        .on("click", function() {
          getSolves($("#challenge-id").val());
        });

      $(".nav-tabs a")
        .off("click")
        .on("click", function(event) {
          event.preventDefault();
          $(this).tab("show");
        });

      $(".load-hint")
        .off("click")
        .on("click", function() {
          loadHint($(this).data("hint-id"));
        });

      $("#challenge-submit")
        .off("click")
        .on("click", function(event) {
          event.preventDefault();
          $("#challenge-submit").addClass("disabled-button").prop("disabled", true);
          CTFd._internal.challenge
            .submit()
            .then(renderSubmissionResponse)
            .then(update);
        });

      $("#challenge-input")
        .off("keyup")
        .on("keyup", function(event) {
          if (event.keyCode === 13) {
            $("#challenge-submit").click();
          }
        });

      if (challenge.postRender) {
        challenge.postRender();
      }

      var solvedCount = parseInt(challenge.data.solves, 10);
      if (!isNaN(solvedCount) && solvedCount > 0) {
        getSolves(challenge.data.id || chal.id);
      }

      if (window.hljs) {
        $("#challenge-window")
          .find("pre code")
          .each(function() {
            window.hljs.highlightBlock(this);
          });
      }

      window.location.replace(window.location.href.split("#")[0] + "#" + chal.name + "-" + chal.id);
      $("#challenge-window").modal();
    });
  }

  function loadChals() {
    var base = (window.init && window.init.urlRoot) || "";
    var request = $.ajax({
      url: base + "/api/v1/challenges",
      method: "GET",
      dataType: "json",
      timeout: 15000,
      cache: false
    });

    request.done(function(response) {
      var payload = [];
      if (response && Array.isArray(response.data)) {
        payload = response.data;
      }
      challenges = Array.isArray(payload) ? payload : [];
      if (window.BETA_sortChallenges) {
        challenges = window.BETA_sortChallenges(challenges);
      }
    });

    request.fail(function(error) {
      console.error("Failed to load challenge list", error);
      $("#challenge-empty")
        .removeClass("d-none")
        .text("Unable to load challenges. Please refresh and try again.");
    });

    request.always(function() {
      renderBoard();
      $("#challenge-loading").addClass("d-none").remove();
      $("#challenges-board").removeClass("d-none");
    });

    return request;
  }

  function update() {
    return loadChals();
  }

  $(function() {
    $("#challenges-board").addClass("d-none");
    $("#challenge-loading").removeClass("d-none");

    $("#challenge-search-button").on("click", function() {
      currentPage = 1;
      renderBoard();
    });

    $("#challenge-search-field").on("change", function() {
      currentPage = 1;
      renderBoard();
    });

    $("#challenge-search-input").on("keyup", function(event) {
      if (event.keyCode === 13) {
        currentPage = 1;
        renderBoard();
      }
    });

    $("#challenge-sort").on("change", function() {
      selectedSort = $(this).val() || "rank";
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

    $(document).on("click", ".challenge-solves-count", function(event) {
      event.preventDefault();
      event.stopPropagation();
      var challengeId = $(this).data("challenge-id");
      if (!challengeId) {
        return;
      }

      var loadResult = loadChal(challengeId);
      if (loadResult && typeof loadResult.then === "function") {
        loadResult.then(function() {
          var solvesTab = $("#challenge-window .challenge-solves").first();
          if (solvesTab.length) {
            solvesTab.trigger("click");
          }
          getSolves(challengeId);
        });
      }
    });

    $("#challenge-window").on("hidden.bs.modal", function() {
      history.replaceState("", window.document.title, window.location.pathname);
    });

    try {
      update().then(function() {
        if (window.location.hash.length > 0) {
          loadChalByName(decodeURIComponent(window.location.hash.substring(1)));
        }
      });
    } catch (e) {
      console.error("Challenge board init failed", e);
      $("#challenge-loading").addClass("d-none");
      $("#challenges-board").removeClass("d-none");
      $("#challenge-empty")
        .removeClass("d-none")
        .text("Challenge board failed to initialize. Check browser console.");
    }
  });

  window.updateChallengeBoard = update;
})();

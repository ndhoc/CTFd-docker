(function() {
  var $ = window.jQuery || window.$;
  var echarts = window.echarts;
  var dayjs = window.dayjs;

  function colorHash(str) {
    var hash = 0;
    var input = String(str || "");
    for (var i = 0; i < input.length; i++) {
      hash = input.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }
    var h = ((hash % 360) + 360) % 360;
    var s = ((hash % 25) + 25) % 25 + 60;
    var l = ((hash % 20) + 20) % 20 + 40;
    return "hsl(" + h + ", " + s + "%, " + l + "%)";
  }

  function cumulativeSum(values) {
    var out = [];
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
      sum += Number(values[i] || 0);
      out.push(sum);
    }
    return out;
  }

  function safeGet(path, obj, fallback) {
    try {
      var cur = obj;
      for (var i = 0; i < path.length; i++) {
        cur = cur[path[i]];
      }
      return cur == null ? fallback : cur;
    } catch (_e) {
      return fallback;
    }
  }

  function buildOption(graphType, responses, name, id) {
    if (graphType === "solve_percentages") {
      var solvesCount = safeGet([0, "data", "length"], responses, 0);
      var failsCount = safeGet([1, "meta", "count"], responses, 0);
      return {
        title: { left: "center", text: "Solve Percentages" },
        tooltip: { trigger: "item" },
        legend: { orient: "vertical", top: "middle", right: 0, data: ["Fails", "Solves"] },
        series: [
          {
            type: "pie",
            radius: ["30%", "50%"],
            data: [
              { value: failsCount, name: "Fails", itemStyle: { color: "rgb(207, 38, 0)" } },
              { value: solvesCount, name: "Solves", itemStyle: { color: "rgb(0, 209, 64)" } }
            ]
          }
        ]
      };
    }

    if (graphType === "category_breakdown") {
      var solves = safeGet([0, "data"], responses, []);
      var categoryMap = {};
      for (var i = 0; i < solves.length; i++) {
        var cat = safeGet(["challenge", "category"], solves[i], "Unknown");
        categoryMap[cat] = (categoryMap[cat] || 0) + 1;
      }
      var keys = Object.keys(categoryMap);
      var pieData = keys.map(function(k) {
        return { value: categoryMap[k], name: k, itemStyle: { color: colorHash(k) } };
      });
      return {
        title: { left: "center", text: "Category Breakdown" },
        tooltip: { trigger: "item" },
        legend: { type: "scroll", orient: "vertical", top: "middle", right: 0, data: keys },
        series: [{ type: "pie", radius: ["30%", "50%"], data: pieData }]
      };
    }

    var points = [];
    var times = [];
    var solvesData = safeGet([0, "data"], responses, []);
    var awardsData = safeGet([2, "data"], responses, []);
    var total = solvesData.concat(awardsData).sort(function(a, b) {
      return new Date(a.date) - new Date(b.date);
    });

    for (var j = 0; j < total.length; j++) {
      var item = total[j];
      var date = dayjs ? dayjs(item.date).toDate() : new Date(item.date);
      times.push(date);
      var p = safeGet(["challenge", "value"], item, item.value || 0);
      points.push(Number(p || 0));
    }

    return {
      title: { left: "center", text: "Score over Time" },
      tooltip: { trigger: "axis" },
      xAxis: [{ type: "category", boundaryGap: false, data: times }],
      yAxis: [{ type: "value" }],
      series: [
        {
          name: String(name || "Score"),
          type: "line",
          areaStyle: { color: colorHash(String(name || "") + String(id || "")) },
          itemStyle: { color: colorHash(String(name || "") + String(id || "")) },
          data: cumulativeSum(points)
        }
      ]
    };
  }

  function draw(graphType, target, responses, id, name) {
    if (!echarts) {
      return;
    }
    var el = document.querySelector(target);
    if (!el) {
      return;
    }

    var chart = echarts.init(el);
    var option = buildOption(graphType, responses || [], name, id);
    chart.setOption(option);

    if ($) {
      $(window).off("resize.graphsFallback").on("resize.graphsFallback", function() {
        if (chart) {
          chart.resize();
        }
      });
    }
  }

  window.createGraph = function(graphType, target, responses, _type, id, name, _accountId) {
    draw(graphType, target, responses, id, name);
  };

  window.updateGraph = function(graphType, target, responses, _type, id, name, _accountId) {
    draw(graphType, target, responses, id, name);
  };

  window.disposeGraph = function(target) {
    if (!echarts) {
      return;
    }
    var el = document.querySelector(target);
    if (el) {
      echarts.dispose(el);
    }
  };
})();

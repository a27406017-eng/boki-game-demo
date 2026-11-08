/**
 * ui.js ― 画面まわりの配線
 *   ・タイトルのボタン / チャプターメニュー / 勘定科目一覧モーダル
 *   ・効果音のON/OFF
 *   ・キーボード操作 (Enter・Space・Esc・数字キー)
 *   ・コピー防止
 * ゲームの進行そのものは game.js が担当する。
 */
"use strict";

(() => {
  const { game, data, sound, storage } = window.Boki;
  const $ = (id) => document.getElementById(id);

  // ===== タイトル画面のボタン =====
  $("start-btn").addEventListener("click", game.startNew);
  $("continue-btn").addEventListener("click", game.continueGame);
  $("how-to-play-btn").addEventListener("click", game.openTutorial);

  // ===== チャプターメニュー =====
  const menu = $("chapterMenu");
  const menuBtn = $("menu-btn");

  function openMenu() {
    menu.classList.remove("hidden");
    menuBtn.setAttribute("aria-expanded", "true");
    $("closeBtn").focus();
  }

  function closeMenu() {
    menu.classList.add("hidden");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.focus();
  }

  // 「第1章」を押すと、その中にチャプター一覧が開く
  function buildChapterList() {
    const group = document.createElement("div");
    group.className = "chapter-group";

    const rootButton = document.createElement("button");
    rootButton.type = "button";
    rootButton.textContent = "第1章";
    rootButton.setAttribute("aria-expanded", "false");
    rootButton.setAttribute("aria-controls", "chapterSubList");

    const subList = document.createElement("div");
    subList.id = "chapterSubList";
    subList.className = "chapter-sub-list hidden";

    rootButton.addEventListener("click", () => {
      const isExpanded = rootButton.getAttribute("aria-expanded") === "true";
      rootButton.setAttribute("aria-expanded", String(!isExpanded));
      subList.classList.toggle("hidden", isExpanded);
    });

    data.chapterTitles.forEach((title, n) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = title;
      button.addEventListener("click", () => {
        game.openChapter(n);
        closeMenu();
      });
      subList.appendChild(button);
    });

    group.append(rootButton, subList);
    $("chapterList").appendChild(group);
  }

  menuBtn.addEventListener("click", openMenu);
  $("closeBtn").addEventListener("click", closeMenu);
  $("homeBtn").addEventListener("click", () => {
    game.goHome();
    closeMenu();
  });
  buildChapterList();

  // ===== 勘定科目一覧モーダル =====
  const chartModal = $("chartModal");

  function openChart() {
    chartModal.classList.remove("hidden");
    $("chartCloseBtn").focus();
  }

  function closeChart() {
    chartModal.classList.add("hidden");
    $("chart").focus();
  }

  $("chart").addEventListener("click", openChart);
  $("chartCloseBtn").addEventListener("click", closeChart);

  // ===== デモ版終了モーダル =====
  const demoEndModal = $("demoEndModal");

  function closeDemoEnd() {
    demoEndModal.classList.add("hidden");
    game.goHome();
  }

  $("demoEndDismissBtn").addEventListener("click", closeDemoEnd);
  const demoEndCloseBtn = $("demoEndCloseBtn");
  if (demoEndCloseBtn) demoEndCloseBtn.addEventListener("click", closeDemoEnd);

  // ===== 効果音のON/OFF (設定は保存される) =====
  const SOUND_KEY = "boki.muted";
  const soundBtn = $("sound-btn");

  function renderSoundButton() {
    const muted = sound.muted;
    soundBtn.dataset.muted = String(muted);
    soundBtn.setAttribute("aria-pressed", String(muted));
    soundBtn.setAttribute("aria-label", muted ? "効果音をオンにする" : "効果音をオフにする");
  }

  const muted = storage.get(SOUND_KEY, false);
  sound.setMuted(muted);
  renderSoundButton();
  soundBtn.addEventListener("click", () => {
    sound.setMuted(!sound.muted);
    storage.set(SOUND_KEY, sound.muted);
    renderSoundButton();
  });

  // ===== キーボード操作 =====
  const isOpen = (element) => !element.classList.contains("hidden");

  document.addEventListener("keydown", (event) => {
    // Esc: 開いているものを閉じる (モーダル → メニューの順)
    if (event.key === "Escape") {
      if (isOpen(chartModal)) closeChart();
      else if (isOpen(menu)) closeMenu();
      return;
    }

    // メニューやモーダルが開いている間は、裏のゲームを進めない
    if (isOpen(menu) || isOpen(chartModal)) return;

    // クイズ: 数字キー 1〜9 で上から順に選択
    if (game.screen === "quiz" && /^[1-9]$/.test(event.key)) {
      game.pickQuizChoice(Number(event.key) - 1);
      return;
    }

    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

    // ストーリー・遊び方: Enter / Space で進む
    if ((event.key === "Enter" || event.key === " " || event.code === "Space") &&
        (game.screen === "story" || game.screen === "tutorial")) {
      event.preventDefault();
      game.advance();
    }
  });

  // ===== コピー防止 =====
  ["contextmenu", "copy", "cut", "selectstart"].forEach((type) => {
    document.addEventListener(type, (event) => event.preventDefault());
  });

  const BLOCKED_SHORTCUT_KEYS = ["c", "x", "a", "s", "u"];
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && BLOCKED_SHORTCUT_KEYS.includes(event.key.toLowerCase())) {
      event.preventDefault();
    }
  });
})();

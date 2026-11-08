/**
 * game.js ― ゲームの進行
 *   ・画面切り替え(タイトル / ストーリー / クイズ / 遊び方)
 *   ・進捗の保存(「続きから」)
 *   ・ストーリー、クイズ、遊び方 それぞれの流れ
 * ボタンのクリック登録など「画面まわりの配線」は ui.js 側にある。
 */
"use strict";

(() => {
  const Boki = window.Boki;
  const { chapters, chapterTitles, quizzes, tutorialLines, PASS_CORRECT } = Boki.data;
  const { storage, DialogueEngine } = Boki;
  const $ = (id) => document.getElementById(id);

  // ===== 画面切り替え =====
  const screens = {
    title: $("title-section"),
    story: $("window"),
    quiz: $("quizPanel"),
    tutorial: $("tutorialPanel")
  };
  let currentScreen = "title";

  function showScreen(name) {
    currentScreen = name;
    Object.entries(screens).forEach(([key, node]) => node.classList.toggle("hidden", key !== name));
    if (name === "title") updateContinueButton();
  }

  function goHome() {
    story.engine.stop();
    tutorial.engine.stop();
    $("chapterMenu").classList.add("hidden");
    $("menu-btn").setAttribute("aria-expanded", "false");
    showScreen("title");
  }

  function showDemoEndModal() {
    const modal = $("demoEndModal");
    modal.classList.remove("hidden");
    $("demoEndCloseBtn").focus();
  }

  // ===== 進捗(「続きから」用) =====
  const PROGRESS_KEY = "boki.progress";

  const progress = {
    load() {
      const data = storage.get(PROGRESS_KEY, null);
      const chapter = data && data.chapter;
      return Number.isInteger(chapter) && chapter >= 0 && chapter < chapters.length ? chapter : null;
    },
    save(chapter) {
      storage.set(PROGRESS_KEY, { chapter });
    }
  };

  function updateContinueButton() {
    const button = $("continue-btn");
    const note = $("continue-note");
    const chapter = progress.load();
    const canContinue = chapter !== null && chapter > 0;
    button.classList.toggle("hidden", !canContinue);
    if (note) note.classList.toggle("hidden", !canContinue);
    if (canContinue && note) {
      button.textContent = `続きから：チャプター${chapter + 1}`;
      note.textContent = `メモ：${chapterTitles[chapter]}`;
    }
  }

  // ===== ストーリー =====
  const story = (() => {
    const skipBtn = $("skipStoryBtn");
    let chapterNo = 0;

    const engine = new DialogueEngine({
      nameEl: $("name"),
      textEl: $("text"),
      speakerEls: [$("window")],
      speedBtn: $("speedBtn"),
      pauseBtn: $("pauseBtn"),
      onShow: (line) => {
        const windowEl = $("window");
        if (line.visual === "term") {
          windowEl.classList.remove("has-balance-sheet", "has-simple-accounts", "has-debit-credit");
          windowEl.classList.add("has-accounting-period");
        } else if (line.visual === "debit-credit") {
          windowEl.classList.remove("has-balance-sheet", "has-simple-accounts", "has-accounting-period");
          windowEl.classList.add("has-debit-credit");
        } else if (line.visual === "none") {
          windowEl.classList.remove("has-balance-sheet", "has-simple-accounts", "has-accounting-period", "has-debit-credit");
        } else if (
          !line.visual &&
          (windowEl.classList.contains("has-accounting-period") ||
            (chapterNo === 3 && windowEl.classList.contains("has-simple-accounts")))
        ) {
          return;
        } else {
          windowEl.classList.toggle("has-balance-sheet", line.visual === "balance-sheet");
          windowEl.classList.toggle("has-simple-accounts", line.visual === "simple-accounts");
          windowEl.classList.remove("has-accounting-period", "has-debit-credit");
        }
      },
      onEnd: finishChapter
    });

    /** n 章以降で最初にクイズがある章の番号(なければ null) */
    function firstQuizFrom(n) {
      const found = Object.keys(quizzes).map(Number).filter((key) => key >= n).sort((a, b) => a - b);
      return found.length ? found[0] : null;
    }

    function open(n) {
      chapterNo = n;
      progress.save(n);
      $("window").classList.remove("has-balance-sheet", "has-simple-accounts", "has-accounting-period", "has-debit-credit");
      skipBtn.classList.toggle("hidden", firstQuizFrom(n) === null);   // 先にクイズが無ければ出さない
      showScreen("story");
      engine.start(chapters[n]);
    }

    // 章を読み終えたとき: クイズがあればクイズへ、なければ次の章へ、最終章ならホームへ
    function finishChapter() {
      if (quizzes[chapterNo]) {
        quiz.start(chapterNo);
      } else if (chapterNo < chapters.length - 1) {
        open(chapterNo + 1);
      } else {
        goHome();
      }
    }

    function skipToQuiz() {
      const target = firstQuizFrom(chapterNo);
      if (target !== null) quiz.start(target);
    }

    $("window").addEventListener("click", () => engine.advance());
    skipBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      skipToQuiz();
    });

    return { engine, open };
  })();

  // ===== クイズ =====
  const quiz = (() => {
    const el = {
      progress: $("quizProgress"),
      combo: $("quizCombo"),
      question: $("quizQuestion"),
      choices: $("quizChoices"),
      result: $("quizResult"),
      hintBtn: $("quizHintButton"),
      hint: $("quizHint"),
      nextBtn: $("nextChapterBtn")
    };
    let chapterNo = 0;     // このクイズが属する章
    let questions = [];
    let index = 0;         // 次に答える問題の番号
    let correct = 0;
    let comboCount = 0;
    let answered = false;

    const passLine = () => Math.min(PASS_CORRECT, questions.length);

    function shuffle(array) {   // フィッシャー–イェーツ
      const copy = [...array];
      for (let n = copy.length - 1; n > 0; n -= 1) {
        const m = Math.floor(Math.random() * (n + 1));
        [copy[n], copy[m]] = [copy[m], copy[n]];
      }
      return copy;
    }

    function getChoicePresentation(question) {
      const journalChoices = question.choices.filter((choice) =>
        choice.startsWith("借方") || choice.startsWith("貸方")
      );
      const isJournalQuestion = journalChoices.some((choice) => choice.startsWith("借方")) &&
        journalChoices.some((choice) => choice.startsWith("貸方"));

      if (!isJournalQuestion) {
        return { choices: question.choices, isJournalQuestion: false };
      }

      const oppositeSide = question.answer.startsWith("借方") ? "貸方" : "借方";
      const oppositeChoice = journalChoices.find((choice) => choice.startsWith(oppositeSide));
      const choices = [question.answer, oppositeChoice]
        .filter(Boolean)
        .sort((left, right) => Number(left.startsWith("貸方")) - Number(right.startsWith("貸方")));

      return { choices: [...new Set(choices)], isJournalQuestion: true };
    }

    function start(n) {
      story.engine.stop();
      chapterNo = n;
      questions = quizzes[n];
      index = 0;
      correct = 0;
      $("quizPanel").dataset.chapter = String(n);
      window.resetDopamineEffect();
      showScreen("quiz");
      showQuestion();
    }

    function showQuestion() {
      const current = questions[index];
      answered = false;
      el.progress.textContent = `第${index + 1}問 / ${questions.length}問　正解数：${correct}問`;
      el.combo.textContent = comboCount >= 2 ? `連続×${comboCount}` : "";
      el.combo.classList.toggle("is-visible", comboCount >= 2);
      el.question.textContent = current.question;
      el.result.textContent = "";
      el.hint.textContent = "";
      el.hintBtn.classList.remove("hidden");
      el.nextBtn.classList.add("hidden");

      // 仕訳は常に借方・貸方の2択、それ以外は問題データの選択肢を使う。
      const { choices, isJournalQuestion } = getChoicePresentation(current);
      el.choices.classList.toggle("journal-choices", isJournalQuestion);
      const displayedChoices = isJournalQuestion ? choices : shuffle(choices);
      el.choices.replaceChildren(
        ...displayedChoices.map((choice) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = choice;
          button.dataset.value = choice;
          if (choice.startsWith("借方")) button.classList.add("choice-debit");
          if (choice.startsWith("貸方")) button.classList.add("choice-credit");
          button.addEventListener("click", () => answer(button));
          return button;
        })
      );
    }

    function answer(chosenButton) {
      if (answered) return;
      answered = true;

      const current = questions[index];
      const isCorrect = chosenButton.dataset.value === current.answer;
      if (isCorrect) {
        correct += 1;
        comboCount += 1;
      } else {
        comboCount = 0;
      }

      // 選択肢は消さずに残し、正解と自分の選択に色を付ける
      el.choices.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
        if (button.dataset.value === current.answer) button.classList.add("is-correct");
        else if (button === chosenButton) button.classList.add("is-wrong");
      });

      if (isCorrect) {
        window.triggerSuccessDopamineEffect(comboCount, chosenButton);
      } else {
        window.triggerIncorrectEffect(chosenButton);
      }
      el.combo.textContent = comboCount >= 2 ? `連続×${comboCount}` : "";
      el.combo.classList.toggle("is-visible", comboCount >= 2);
      index += 1;

      const feedback = `${isCorrect ? "○ 正解" : "× 不正解"}　${current.explanation}`;
      el.hint.textContent = "";
      el.hintBtn.classList.add("hidden");

      if (index < questions.length) {
        el.result.textContent = feedback;
        el.nextBtn.textContent = "次の問題へ";
      } else {
        const passed = correct >= passLine();
        el.progress.textContent = `結果：${correct} / ${questions.length}問 正解`;
        el.result.textContent = `${feedback}\n${
          passed
            ? `${passLine()}問以上正解しました。次へ進めます。`
            : `次へ進むには、${passLine()}問以上正解する必要があります。`
        }`;
        el.nextBtn.textContent = passed
          ? chapterNo === chapters.length - 1 ? "ホームに戻る" : `チャプター${chapterNo + 2}へ`
          : "もう一度挑戦";
      }
      el.nextBtn.classList.remove("hidden");
      el.nextBtn.focus();
    }

    el.hintBtn.addEventListener("click", () => {
      el.hint.textContent = `ヒント：${questions[index].hint}`;
    });

    el.nextBtn.addEventListener("click", () => {
      if (index < questions.length) {
        showQuestion();                 // 次の問題へ
      } else if (correct < passLine()) {
        index = 0;                      // 不合格: 最初からやり直し
        correct = 0;
        showQuestion();
      } else if (chapterNo < chapters.length - 1) {
        story.open(chapterNo + 1);      // 合格: 次の章へ
      } else {
        showDemoEndModal();             // 最終章のクイズ合格後はデモ終了を表示
      }
    });

    /** キーボード用: 上から n 番目の選択肢を選ぶ(0始まり) */
    function pick(n) {
      const button = el.choices.children[n];
      if (button) button.click();
    }

    function resetCombo() {
      comboCount = 0;
    }

    return { start, pick, resetCombo };
  })();

  // ===== 遊び方 =====
  const tutorial = (() => {
    const choicesEl = $("tutorialChoices");
    const feedback = $("tutorialFeedback");
    const guide = $("tutorialGuide");
    const closeBtn = $("tutorialCloseBtn");
    let answered = false;

    const engine = new DialogueEngine({
      nameEl: $("tutorialName"),
      textEl: $("tutorialText"),
      speedBtn: $("tutorialSpeedBtn"),
      pauseBtn: $("tutorialPauseBtn"),
      autoAdvanceAtEnd: false,                        // 最後の行では自動で進めない
      canAdvance: (line) => !line.quiz || answered,   // クイズ付きの行は答えるまで進めない
      onShow: renderLine,
      onLineDone: (line, isLast) => {
        if (isLast && !line.quiz) showEnd();
      },
      onEnd: showEnd
    });

    function renderLine(line) {
      answered = false;
      feedback.textContent = "";
      choicesEl.replaceChildren();
      choicesEl.classList.toggle("hidden", !line.quiz);
      guide.textContent = line.quiz ? "答えを選んでね" : "画面をクリックして進む";
      if (!line.quiz) return;

      line.quiz.choices.forEach((choice, choiceIndex) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = choice;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          if (choiceIndex === line.quiz.answer) {
            answered = true;
            feedback.textContent = line.quiz.explain;
            guide.textContent = "画面をクリックして続ける";
          } else {
            feedback.textContent = `ヒント：${line.quiz.hint}`;
            guide.textContent = "もう一度答えを選んでね";
          }
        });
        choicesEl.appendChild(button);
      });
    }

    function showEnd() {
      guide.textContent = "体験終了！ホームに戻ってゲームを始めよう";
      closeBtn.classList.remove("hidden");
    }

    function open() {
      showScreen("tutorial");
      closeBtn.classList.add("hidden");
      engine.start(tutorialLines, { speed: 0 });
    }

    $("tutorialWindow").addEventListener("click", () => engine.advance());
    closeBtn.addEventListener("click", goHome);

    return { engine, open };
  })();

  // ===== ui.js に公開する操作 =====
  Boki.game = {
    startNew: () => {
      quiz.resetCombo();
      story.open(0);
    },
    continueGame: () => {
      quiz.resetCombo();
      story.open(progress.load() ?? 0);
    },
    openChapter: (n) => {
      quiz.resetCombo();
      story.open(n);
    },
    openTutorial: tutorial.open,
    goHome,
    advance() {
      if (currentScreen === "story") story.engine.advance();
      else if (currentScreen === "tutorial") tutorial.engine.advance();
    },
    pickQuizChoice: quiz.pick,
    get screen() {
      return currentScreen;
    }
  };

  showScreen("title");
})();

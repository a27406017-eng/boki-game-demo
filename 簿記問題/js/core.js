/**
 * core.js ― 共通部品
 *   ・storage        : localStorage の安全なラッパー
 *   ・sound          : セリフ送りの効果音
 *   ・DialogueEngine : 「文字送り / 自動送り / 速度 / 一時停止」を担当する会話エンジン
 *                      (ストーリーと遊び方の両方がこれを使う)
 */
"use strict";

(() => {
  const Boki = (window.Boki = window.Boki || {});

  // ===== 保存(使えない環境でもゲームが止まらないよう try/catch) =====
  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* 保存できない環境では何もしない */
      }
    }
  };

  // ===== 効果音 =====
  // core.js の位置を基準にするため、ルートと簿記問題/のどちらのHTMLでも同じURLになる。
  const audioFileURL = (filename) => new URL(`../効果音/${filename}`, document.currentScript.src);
  const sound = (() => {
    const audio = new Audio(audioFileURL("文字送りa長.mp3"));
    audio.loop = true;
    const answerSounds = {
      correct: new Audio(audioFileURL("正解音.mp3")),
      incorrect: new Audio(audioFileURL("不正解音源.mp3"))
    };
    let warned = false;

    return {
      start(rate = 1) {
        if (!audio.paused) return;
        audio.playbackRate = rate;
        audio.currentTime = 0;
        const result = audio.play();
        if (result && typeof result.catch === "function") {
          result.catch((error) => {
            // stop() との競合による中断は正常動作なので無視。警告は1回だけ。
            if (error && error.name === "AbortError") return;
            if (!warned) {
              warned = true;
              console.warn("文字送り音声を再生できませんでした。", error);
            }
          });
        }
      },
      stop() {
        audio.pause();
        audio.currentTime = 0;
        audio.playbackRate = 1;
      },
      playAnswer(type) {
        const answerAudio = answerSounds[type];
        if (!answerAudio) {
          throw new RangeError(`未登録の回答音です: ${type}`);
        }
        answerAudio.currentTime = 0;
        const result = answerAudio.play();
        if (result && typeof result.catch === "function") {
          result.catch((error) => {
            if (error && error.name === "AbortError") return;
            console.warn("回答音声を再生できませんでした。", error);
          });
        }
      },
      setMuted(muted) {
        audio.muted = Boolean(muted);
        Object.values(answerSounds).forEach((answerAudio) => {
          answerAudio.muted = audio.muted;
        });
      },
      get muted() {
        return audio.muted;
      }
    };
  })();

  // ===== 話者に応じたクラスを付ける (名前札・吹き出しの配置に使う) =====
  const SPEAKER_CLASS = { "主人公": "speaker-protagonist", "妖精": "speaker-fairy" };
  const ALL_SPEAKER_CLASSES = ["speaker-protagonist", "speaker-fairy", "speaker-unknown"];

  function setSpeakerClass(element, speaker) {
    element.classList.remove(...ALL_SPEAKER_CLASSES);
    element.classList.add(SPEAKER_CLASS[speaker] || "speaker-unknown");
  }

  // ===== 会話エンジン =====
  const TYPE_INTERVAL = 50;   // 1文字出すまでの時間(ms)
  const AUTO_DELAY = 2500;    // 1行読み終えてから次へ進むまでの時間(ms)
  const SPEED_LABELS = { 0: "手動再生中", 1: "通常速度", 2: "2倍速" };
  const NEXT_SPEED = { 0: 2, 2: 1, 1: 0 };   // 手動 → 2倍速 → 通常 → 手動 …

  class DialogueEngine {
    /**
     * @param {object}   options
     * @param {Element}  options.nameEl          話者名を出す要素
     * @param {Element}  options.textEl          セリフを出す要素
     * @param {Element[]} [options.speakerEls]   話者クラスを付けたい追加の要素
     * @param {Element}  [options.speedBtn]      速度ボタン
     * @param {Element}  [options.pauseBtn]      一時停止ボタン
     * @param {boolean}  [options.autoAdvanceAtEnd=true] 最後の行でも自動で先へ進むか
     * @param {Function} [options.canAdvance]    (line) => boolean
     * @param {Function} [options.onShow]        (line, index) 新しい行を表示した直後
     * @param {Function} [options.onLineDone]    (line, isLast) 1行ぶん表示し終えた直後
     * @param {Function} [options.onEnd]         最後の行のあとにさらに進めたとき
     */
    constructor(options) {
      Object.assign(this, { speakerEls: [], autoAdvanceAtEnd: true }, options);
      this.lines = [];
      this.index = 0;
      this.speed = 0;          // 0:手動 1:通常 2:2倍速
      this.paused = false;
      this.typing = false;
      this.fullText = "";
      this.chars = 0;
      this.typeTimer = null;
      this.autoTimer = null;

      // ボタンは吹き出しの内側にあるので、クリックが吹き出し側へ伝わらないようにする
      if (this.speedBtn) {
        this.speedBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          this.setSpeed(NEXT_SPEED[this.speed]);
        });
      }
      if (this.pauseBtn) {
        this.pauseBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          this.setPaused(!this.paused);
        });
      }
      this.renderControls();
    }

    /** 新しいセリフ列を最初から再生する。speed を渡すと速度も指定できる */
    start(lines, { speed } = {}) {
      this.stop();
      this.lines = lines;
      this.index = 0;
      this.paused = false;
      if (speed !== undefined) this.speed = speed;
      this.renderControls();
      this.show();
    }

    /** タイマーと効果音を止める(画面を離れるときに呼ぶ) */
    stop() {
      this.stopTyping();
      this.clearAuto();
    }

    /** 次へ進む(クリック・Enter・自動送りの共通入口) */
    advance() {
      if (this.paused || this.lines.length === 0) return;

      if (this.typing) {          // 文字送り中なら、まず全文を表示
        this.completeLine();
        return;
      }
      if (this.canAdvance && !this.canAdvance(this.lines[this.index])) return;

      if (this.index < this.lines.length - 1) {
        this.index += 1;
        this.show();
      } else if (this.onEnd) {
        this.onEnd();
      }
    }

    setSpeed(speed) {
      this.speed = speed;
      this.renderControls();
      if (this.paused) return;
      if (this.typing) this.startTyping();   // 新しい速度で文字送りをやり直す
      this.scheduleAuto();
    }

    setPaused(paused) {
      this.paused = paused;
      this.renderControls();
      if (paused) {
        this.stopTyping();
        this.clearAuto();
      } else if (this.typing) {
        this.startTyping();
      } else {
        this.scheduleAuto();
      }
    }

    // ----- ここから内部処理 -----

    show() {
      const line = this.lines[this.index];
      this.nameEl.textContent = line.name;
      [this.nameEl, ...this.speakerEls].forEach((el) => setSpeakerClass(el, line.name));

      this.fullText = line.text;
      this.chars = 0;
      this.typing = true;
      this.textEl.textContent = "";
      this.clearAuto();
      if (this.onShow) this.onShow(line, this.index);
      this.startTyping();
    }

    startTyping() {
      this.stopTyping();
      if (this.paused || !this.typing) return;
      sound.start(this.speed === 2 ? 2 : 1);

      const step = () => {
        this.typeTimer = setTimeout(() => {
          if (this.paused || !this.typing) return;
          this.chars += 1;
          this.textEl.textContent = this.fullText.slice(0, this.chars);
          if (this.chars >= this.fullText.length) {
            this.completeLine();
          } else {
            step();
          }
        }, TYPE_INTERVAL / (this.speed || 1));
      };
      step();
    }

    stopTyping() {
      clearTimeout(this.typeTimer);
      this.typeTimer = null;
      sound.stop();
    }

    /** 1行ぶんを全部表示した状態にする(自然に終わったときも、クリックで飛ばしたときも) */
    completeLine() {
      this.stopTyping();
      this.typing = false;
      this.chars = this.fullText.length;
      this.textEl.textContent = this.fullText;
      if (this.onLineDone) {
        this.onLineDone(this.lines[this.index], this.index === this.lines.length - 1);
      }
      this.scheduleAuto();
    }

    scheduleAuto() {
      this.clearAuto();
      if (this.speed === 0 || this.paused || this.typing) return;
      if (this.index >= this.lines.length - 1 && !this.autoAdvanceAtEnd) return;
      this.autoTimer = setTimeout(() => this.advance(), AUTO_DELAY / this.speed);
    }

    clearAuto() {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }

    renderControls() {
      if (this.speedBtn) {
        const label = SPEED_LABELS[this.speed];
        this.speedBtn.textContent = label;
        this.speedBtn.setAttribute("aria-label", `現在の再生モード：${label}`);
        this.speedBtn.setAttribute("aria-pressed", String(this.speed === 0));
      }
      if (this.pauseBtn) {
        this.pauseBtn.textContent = this.paused ? "一時停止中：再生" : "再生中：一時停止";
        this.pauseBtn.setAttribute(
          "aria-label",
          this.paused ? "一時停止中。押すと再生します" : "再生中。押すと一時停止します"
        );
        this.pauseBtn.setAttribute("aria-pressed", String(this.paused));
      }
    }
  }

  Boki.storage = storage;
  Boki.sound = sound;
  Boki.DialogueEngine = DialogueEngine;
})();

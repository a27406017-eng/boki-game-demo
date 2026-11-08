/**
 * effects.js - 問題画面の控えめな正誤演出
 */
"use strict";

(() => {
  const quizPanel = document.getElementById("quizPanel");
  const banner = document.getElementById("dopamineBanner");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EFFECT = Object.freeze({
    buttonDurationMs: 300,
    cardDurationMs: 400,
    messageDurationMs: 1000
  });
  let messageTimer;
  let cardTimer;

  if (window.gsap && window.TextPlugin) {
    window.gsap.registerPlugin(window.TextPlugin);
  }

  function playAnswerSound(type) {
    if (window.Boki && window.Boki.sound && typeof window.Boki.sound.playAnswer === "function") {
      window.Boki.sound.playAnswer(type);
    }
  }

  function showResultMessage(text, className) {
    window.clearTimeout(messageTimer);
    banner.className = `result-message ${className}`;
    banner.textContent = text;
    messageTimer = window.setTimeout(() => {
      banner.classList.remove("is-visible");
    }, EFFECT.messageDurationMs);
    requestAnimationFrame(() => banner.classList.add("is-visible"));
  }

  function animateCard(className) {
    window.clearTimeout(cardTimer);
    quizPanel.classList.remove("answer-success", "answer-failure");
    if (reducedMotion) return;

    void quizPanel.offsetWidth;
    quizPanel.classList.add(className);
    cardTimer = window.setTimeout(() => quizPanel.classList.remove(className), EFFECT.cardDurationMs);
  }

  function showIncorrectEffect(button) {
    button.classList.add("answer-button-wrong");
    if (!reducedMotion) {
      window.setTimeout(() => button.classList.remove("answer-button-wrong"), EFFECT.buttonDurationMs);
    }
    showResultMessage("不正解…", "result-message-wrong");
    animateCard("answer-failure");
    playAnswerSound("incorrect");
  }

  function triggerSuccessDopamineEffect(comboCount, button) {
    if (!Number.isInteger(comboCount) || comboCount < 1) {
      throw new RangeError("comboCount must be a positive integer.");
    }

    button.classList.add("answer-button-correct");
    if (!reducedMotion) {
      window.setTimeout(() => button.classList.remove("answer-button-correct"), EFFECT.buttonDurationMs);
    }
    showResultMessage("正解！", "result-message-correct");
    animateCard("answer-success");
    playAnswerSound("correct");
  }

  function resetDopamineEffect() {
    window.clearTimeout(messageTimer);
    window.clearTimeout(cardTimer);
    quizPanel.classList.remove("combo-active", "fever-active", "answer-success", "answer-failure");
    banner.className = "";
    banner.textContent = "";
  }

  window.triggerSuccessDopamineEffect = triggerSuccessDopamineEffect;
  window.triggerIncorrectEffect = showIncorrectEffect;
  window.resetDopamineEffect = resetDopamineEffect;
})();

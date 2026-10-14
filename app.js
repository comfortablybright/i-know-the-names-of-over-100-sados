let characters = [];
let hiddenCharacters = [];
let elements = {};
let currentVoiceAudio = null;
let fireworksAnimationId = null;

const PLACEHOLDER_IMAGE = "data/image/sado/EliasCitizen.png";
const THEME_KEY = "characterQuizTheme";
const HIDDEN_PAREN_RE = /\([^()]*\)|（[^（）]*）/g;

const sfx = name => [1, 2, 3].map(i => `data/audio/sfx/${name}_${i}.wav`);
const WIN_VOICES = sfx("win");
const PARTIAL_WIN_VOICES = sfx("partial_win");
const GIVE_UP_VOICES = sfx("lose");

const PERSONALITY_ORDER = ["순수", "냉정", "광기", "활발", "우울", "공명"];
const RACE_ORDER = ["요정", "수인", "엘프", "정령", "유령", "용족", "마녀", "미스틱"];

const CATEGORIES = [
  { id: "none", label: "없음" },
  { id: "personality", label: "성격" },
  { id: "race", label: "종족" }
];

const RELEASE_CATEGORIES = [
  { id: "quarter", label: "엘다인 분기" },
  { id: "none", label: "없음" }
];

const GAME_MODES = [
  { id: "all", label: "모두 외우기" },
  { id: "personality", label: "성격별 외우기" },
  { id: "race", label: "종족별 외우기" },
  { id: "release", label: "출시순 외우기" }
];

const SORT_MODES = [
  { id: "answer", label: "정답순" },
  { id: "release", label: "출시순" }
];

const MODE_KEYS = [
  "mode", "category", "sortMode", "releaseInitialIncluded",
  "releaseReverse", "timeLimited", "timeLimitMinutes", "skipLimit"
];

const state = {
  guessedIds: new Set(),
  guessedAnswers: new Map(),
  skippedIds: new Set(),
  missedIds: [],
  usedAnswers: new Set(),
  answerOrder: [],
  hiddenGuessedAnswers: new Map(),
  hiddenUsedAnswers: new Set(),
  mode: "all",
  category: "none",
  sortMode: "answer",
  selectedPersonalities: new Set(),
  selectedRaces: new Set(),
  releaseInitialIncluded: false,
  releaseReverse: false,
  startedAt: null,
  timerId: null,
  elapsedSeconds: 0,
  finished: false,
  gaveUp: false,
  skipCount: 0,
  hintCharacterId: null,
  hintSolvedCount: 0,
  finishResult: null,
  gameStarted: false,
  soundEnabled: true,
  aliasTooltipsEnabled: false,
  sensitiveAliasesEnabled: false,
  timeLimited: false,
  timeLimitMinutes: 10,
  activeTimeLimit: null,
  skipLimit: 3,
  modeBackup: null
};

const $ = selector => document.querySelector(selector);
const pick = list => list[Math.floor(Math.random() * list.length)];
const getCharacter = id => characters.find(c => c.id === id);

document.addEventListener("DOMContentLoaded", () => {
  elements = {
    canvas: $("#confettiCanvas"),
    input: $("#answerInput"),
    missedOverlay: $("#missedOverlay"),
    missedList: $("#missedList"),
    creditsOverlay: $("#creditsOverlay"),
    gameInfoMode: $("#gameInfoMode"),
    gameInfoOptions: $("#gameInfoOptions"),
    score: $("#score"),
    skipOptions: $("#skipOptions"),
    timer: $("#timer"),
    timerOptions: $("#timerOptions"),
    message: $("#message"),
    grid: $("#characterGrid"),
    reset: $("#resetButton"),
    giveUp: $("#giveUpButton"),
    skip: $("#skipButton"),
    sound: $("#soundButton"),
    changeMode: $("#changeModeButton"),
    overlay: $("#modeOverlay"),
    gameModeButtons: $("#gameModeButtons"),
    categorySection: $("#categorySection"),
    categoryButtons: $("#categoryButtons"),
    sortSection: $("#sortSection"),
    sortButtons: $("#sortButtons"),
    personalitySection: $("#personalitySection"),
    personalityButtons: $("#personalityButtons"),
    raceSection: $("#raceSection"),
    raceButtons: $("#raceButtons"),
    releaseSection: $("#releaseSection"),
    releaseInitialIncluded: $("#releaseInitialIncluded"),
    releaseReverse: $("#releaseReverse"),
    timeInfiniteButton: $("#timeInfiniteButton"),
    timeLimitBox: $("#timeLimitBox"),
    timeLimitInput: $("#timeLimitInput"),
    skipLimitInput: $("#skipLimitInput"),
    theme: $("#themeButton"),
    aliasTooltipButton: $("#aliasTooltipButton"),
    sensitiveAliasButton: $("#sensitiveAliasButton"),
    hintOverlay: $("#hintOverlay"),
    hintOverlayImage: $("#hintOverlayImage")  };

  const closeCredits = () => elements.creditsOverlay.classList.add("hidden");

  elements.input.addEventListener("input", handleInput);
  [
    [elements.reset, resetGame],
    [elements.giveUp, giveUpCurrentGame],
    [elements.skip, useHint],
    [$("#hintSkipButton"), skipHintCharacter],
    [elements.sound, toggleSound],
    [elements.changeMode, openModeOverlay],
    [$("#closeModeButton"), handleCloseMode],
    [$("#closeMissedButton"), () => elements.missedOverlay.classList.add("hidden")],
    [$("#startButton"), startGame],
    [elements.theme, toggleTheme],
    [elements.aliasTooltipButton, toggleAliasTooltips],
    [elements.sensitiveAliasButton, toggleSensitiveAliases],
    [$("#creditsButton"), () => elements.creditsOverlay.classList.remove("hidden")],
    [$("#creditsCloseButton"), closeCredits]
  ].forEach(([el, fn]) => el.addEventListener("click", fn));

  elements.creditsOverlay.addEventListener("click", event => {
    if (event.target === elements.creditsOverlay) closeCredits();
  });

  updateAliasTooltipButton();
  updateSensitiveAliasButton();
  initializeCanvas();
  applyTheme(localStorage.getItem(THEME_KEY) === "dark");
  initializeKeyboardViewport();
  const refreshHintOverlay = () => {
    if (state.hintCharacterId) positionHintOverlay();
  };
  window.addEventListener("resize", refreshHintOverlay);
  $(".app").addEventListener("scroll", refreshHintOverlay, { passive: true });
  loadCharacters();
});

document.addEventListener("contextmenu", event => {
  event.preventDefault();
});

document.addEventListener("dragstart", event => {
  if (event.target instanceof HTMLImageElement) {
    event.preventDefault();
  }
});

function setMessage(text, type = "") {
  elements.message.textContent = text;
  elements.message.className = type ? `message ${type}` : "message";
}

function updateScore() {
  elements.score.textContent = `${state.guessedIds.size} / ${getTargetCharacters().length}`;
}

async function loadCharacters() {
  try {
    const [response, hiddenResponse] = await Promise.all([
      fetch("./data/characters.json", { cache: "no-store" }),
      fetch("./data/characters_hidden.json", { cache: "no-store" })
    ]);

    if (!response.ok) throw new Error(`characters.json 로드 실패 (${response.status})`);
    if (!hiddenResponse.ok) throw new Error(`characters_hidden.json 로드 실패 (${hiddenResponse.status})`);

    const data = await response.json();
    const hiddenData = await hiddenResponse.json();

    if (!Array.isArray(data)) throw new Error("일반 캐릭터 데이터 형식 오류");
    if (!Array.isArray(hiddenData)) throw new Error("히든 캐릭터 데이터 형식 오류");

    characters = data.filter(isValidCharacter);
    hiddenCharacters = hiddenData.filter(isValidHiddenCharacter);

    if (characters.length === 0) throw new Error("사용 가능한 일반 캐릭터 데이터 없음");

    render();
    openModeOverlay();
  } catch (error) {
    console.error(error);
    elements.score.textContent = "0 / 0";
    setMessage("캐릭터 데이터를 불러오지 못했습니다.", "error");
  }
}

function isValidCharacter(character) {
  return Boolean(
    character &&
    typeof character.id === "string" &&
    typeof character.name === "string" &&
    Number.isFinite(Number(character.releaseOrder))
  );
}

function isValidHiddenCharacter(character) {
  return Boolean(
    character &&
    typeof character.id === "string" &&
    typeof character.name === "string"
  );
}

function handleInput() {
  if (!state.gameStarted || state.finished) return;

  const rawValue = elements.input.value;
  const spaceMode = rawValue === "   ";
  const value = rawValue.trim();
  if (!value && !spaceMode) return;

  const result = findAnswer(value, spaceMode);

  if (result) {
    if (!reveal(result.character, result.answer)) return;
    if (state.startedAt === null) startTimer();
  } else {
    if (state.hintCharacterId) return;
    const hiddenResult = findHiddenAnswer(value, spaceMode);
    if (!hiddenResult) return;
    revealHidden(hiddenResult.character, hiddenResult.answer);
  }

  const input = elements.input;
  input.value = "";
  if (!state.finished) {
    input.blur();
    input.focus();
  }
}

function findAnswer(input, spaceMode = false) {
  const normalized = normalize(input);
  if (!normalized && !spaceMode) return null;

  for (const character of getTargetCharacters()) {
    if (state.skippedIds.has(character.id)) continue;
    if (state.hintCharacterId && character.id !== state.hintCharacterId) continue;

    for (const answer of getAnswers(character)) {
      if (spaceMode ? isSpaceAnswer(answer.text) : normalize(answer.text) === normalized) {
        return { character, answer };
      }
    }
  }

  return null;
}

function reveal(character, answer) {
  const normalized = normalize(answer.text);
  const baseKey = normalize(answer.text.replace(/[()（）]/g, ""));

  if (
    state.usedAnswers.has(normalized) ||
    state.usedAnswers.has(baseKey) ||
    !canRevealCharacter(character)
  ) {
    return false;
  }

  state.usedAnswers.add(normalized);
  state.usedAnswers.add(baseKey);

  if (!state.guessedIds.has(character.id)) {
    state.guessedIds.add(character.id);
    if (isAnswerSort()) state.answerOrder.push(character.id);
  }

  state.guessedAnswers.set(character.id, answer);
  if (state.hintCharacterId === character.id) {
    state.hintCharacterId = null;
    state.hintSolvedCount += 1;
    setMessage("");
    renderGameInfo();
    updateGameControls();
  }
  playSound(answer.sound);
  updateSlot(character.id);
  updateScore();

  if (getRemainingCharacters().length === 0) finishQuiz(getFinishResult());

  return true;
}

const hiddenKeys = answer => [
  normalize(answer.text),
  normalize(answer.text.replace(HIDDEN_PAREN_RE, ""))
];

function findHiddenAnswer(input, spaceMode = false) {
  const normalized = normalize(input);
  if (!normalized && !spaceMode) return null;

  for (const character of hiddenCharacters) {

    for (const answer of getAnswers(character)) {
      const keys = hiddenKeys(answer);
      if (keys.some(key => state.hiddenUsedAnswers.has(key))) continue;
      if (spaceMode ? isSpaceAnswer(answer.text) : keys.includes(normalized)) return { character, answer };
    }
  }

  return null;
}

function revealHidden(character, answer) {
  hiddenKeys(answer).forEach(key => state.hiddenUsedAnswers.add(key));
  state.hiddenGuessedAnswers.set(character.id, answer);
  playSound(answer.sound);
  renderHiddenGroup();
}

const collectMissed = list => list.filter(c => !state.guessedIds.has(c.id)).map(c => c.id);

const FINISH_RESULTS = {
  win: {
    message: "해냈어요! 모든 친구들 이름을 기억했어요! 와아~!",
    voices: WIN_VOICES,
    fireworks: true
  },
  assisted_win: {
    message: "대단해요! 이제 교주님 혼자서 해내실 수 있으실 것 같아요!",
    voices: PARTIAL_WIN_VOICES,
    fireworks: false
  },
  partial_win: {
    message: "멋져요! 다음엔 모든 친구들 이름을 기억해 보는 거예요!",
    voices: PARTIAL_WIN_VOICES,
    fireworks: false
  }
};

function getFinishResult() {
  if (state.skippedIds.size > 0) return "partial_win";
  if (state.hintSolvedCount > 0) return "assisted_win";
  return "win";
}

function finishQuiz(result) {
  const config = FINISH_RESULTS[result];

  state.finished = true;
  state.finishResult = result;
  stopTimer();
  elements.input.value = "";
  state.missedIds = collectMissed(getTargetCharacters());

  setMessage(config.message, "success");

  updateGameControls();
  if (config.fireworks) triggerFireworks();
  playRandomVoice(config.voices);
}

function giveUpCurrentGame() {
  if (state.finished) {
    openMissedOverlay();
    return;
  }

  endGameByReveal("포기했어요. 히잉...");
}

function endGameByReveal(message) {
  if (!state.gameStarted || state.finished) return;

  state.gaveUp = true;
  state.finished = true;
  state.hintCharacterId = null;
  stopTimer();

  const visible = getVisibleCharacters();

  for (const character of visible) {
    if (state.guessedIds.has(character.id) || state.skippedIds.has(character.id)) continue;
    setPlainAnswer(character);
    if (isAnswerSort()) state.answerOrder.push(character.id);
    updateSlot(character.id);
  }

  state.missedIds = collectMissed(visible);

  elements.input.value = "";
  setMessage(message, "give-up");
  updateGameControls();
  playRandomVoice(GIVE_UP_VOICES);
}

function setPlainAnswer(character) {
  state.guessedAnswers.set(character.id, {
    image: character.image ?? null,
    sound: character.sound ?? null
  });
}

function useHint() {
  if (!state.gameStarted || state.finished) return;
  if (state.skipLimit <= 0 || state.skipCount >= state.skipLimit) return;

  const character = getNextSkipCharacter();
  if (!character) return;

  if (state.startedAt === null) startTimer();

  state.skipCount += 1;
  state.hintCharacterId = character.id;

  renderGameInfo();
  updateGameControls();
  elements.input.focus();
}

function skipHintCharacter() {
  if (!state.gameStarted || state.finished || !state.hintCharacterId) return;

  const character = getCharacter(state.hintCharacterId);
  state.hintCharacterId = null;
  if (!character) return;

  state.skippedIds.add(character.id);
  setPlainAnswer(character);
  if (isAnswerSort()) state.answerOrder.push(character.id);

  setMessage("");
  playSound(character.sound);
  updateSlot(character.id);
  renderGameInfo();
  updateGameControls();

  if (getRemainingCharacters().length === 0) {
    finishQuiz(getFinishResult());
    return;
  }

  elements.input.focus();
}

function getNextSkipCharacter() {
  const remaining = getRemainingCharacters();
  if (remaining.length === 0) return null;
  if (state.mode !== "release") return pick(remaining);

  const order = c => Number(c.releaseOrder);
  const initial = remaining.filter(isReleaseInitialCharacter);
  const normal = remaining.filter(c => !isReleaseInitialCharacter(c));
  let candidates;

  if (state.releaseReverse) {
    if (normal.length > 0) {
      const max = Math.max(...normal.map(order));
      candidates = normal.filter(c => order(c) === max);
    } else {
      candidates = initial;
    }
  } else if (initial.length > 0) {
    candidates = initial;
  } else {
    const min = Math.min(...remaining.map(order));
    candidates = remaining.filter(c => order(c) === min);
  }

  return pick(candidates);
}

function resetGame() {
  resetGameState();
  render();
  if (state.gameStarted) elements.input.focus();
}

function resetGameState() {
  stopTimer();
  stopVoice();
  clearFireworks();

  state.guessedIds.clear();
  state.guessedAnswers.clear();
  state.skippedIds.clear();
  state.missedIds = [];
  state.usedAnswers.clear();
  state.answerOrder = [];
  state.hiddenGuessedAnswers.clear();
  state.hiddenUsedAnswers.clear();
  state.startedAt = null;
  state.elapsedSeconds = 0;
  state.finished = false;
  state.gaveUp = false;
  state.skipCount = 0;
  state.hintCharacterId = null;
  state.hintSolvedCount = 0;
  state.finishResult = null;

  replaceInput();
  elements.timer.textContent = formatTime(state.activeTimeLimit ?? 0);
  setMessage("");
}

function replaceInput() {
  const newInput = elements.input.cloneNode(true);
  newInput.disabled = false;
  newInput.value = "";
  elements.input.replaceWith(newInput);
  elements.input = newInput;
  elements.input.addEventListener("input", handleInput);
}

function render() {
  elements.changeMode.textContent = state.gameStarted ? "새 퀴즈" : "모드 선택";
  renderGameInfo();

  elements.grid.innerHTML = "";

  if (isAnswerSort()) {
    renderAnswerOrderSlots();
  } else if (state.mode === "release" && state.category === "quarter") {
    renderReleaseQuarterGroups(getVisibleCharacters());
  } else {
    renderNormalGroups(getVisibleCharacters());
  }

  renderHiddenGroup();
  updateScore();
  updateGameControls();
}

function createGroup(title, className = "character-group") {
  const box = document.createElement("section");
  box.className = className;

  if (title !== null) {
    const groupTitle = document.createElement("div");
    groupTitle.className = "group-title";
    groupTitle.textContent = title;
    box.appendChild(groupTitle);
  }

  return box;
}

function addSlots(box) {
  const slots = document.createElement("div");
  slots.className = "character-slots";
  box.appendChild(slots);
  return slots;
}

function renderNormalGroups(visibleCharacters) {
  let previousGroup = null;
  let currentSlots = null;

  for (const character of visibleCharacters) {
    const group = getGroupKey(character);

    if (currentSlots === null || (group !== null && group !== previousGroup)) {
      const box = createGroup(group);
      currentSlots = addSlots(box);
      elements.grid.appendChild(box);
      previousGroup = group;
    }

    currentSlots.appendChild(buildSlot(character));
  }
}

function renderReleaseQuarterGroups(visibleCharacters) {
  const initialTerms = new Map();
  const years = new Map();

  const pushTo = (map, key, character) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(character);
  };

  for (const character of visibleCharacters) {
    const term = Number(character.releaseTerm);

    if (isReleaseInitialCharacter(character)) {
      pushTo(initialTerms, term, character);
      continue;
    }

    const year = getReleaseYear(term);
    if (year === null || getReleaseQuarter(term) === null) continue;

    if (!years.has(year)) years.set(year, new Map());
    pushTo(years.get(year), term, character);
  }

  const appendTermRows = (group, terms) => {
    for (const term of [...terms.keys()].sort((a, b) => a - b)) {
      const row = document.createElement("div");
      row.className = "release-quarter-row";
      terms.get(term).sort(compareById).forEach(c => row.appendChild(buildSlot(c)));
      group.appendChild(row);
    }
  };

  if (initialTerms.size > 0) {
    const group = createGroup("출시 초기 사도", "release-year-group");

    const notice = document.createElement("div");
    notice.className = "release-initial-notice";
    notice.textContent = "순서 상관없이 맞춰도 됩니다.";
    group.appendChild(notice);

    appendTermRows(group, initialTerms);
    elements.grid.appendChild(group);
  }

  for (const year of [...years.keys()].sort((a, b) => a - b)) {
    const group = createGroup(`${year}년차`, "release-year-group");
    appendTermRows(group, years.get(year));
    elements.grid.appendChild(group);
  }
}

function renderAnswerOrderSlots() {
  const counts = new Map();

  for (const character of getVisibleCharacters()) {
    const key = getGroupKey(character) ?? null;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  for (const [key, count] of counts) {
    const box = createGroup(key);
    const slots = addSlots(box);
    const order = getGroupAnswerOrder(key);

    for (let i = 0; i < count; i++) {
      slots.appendChild(buildSlot(getCharacter(order[i]), key, i));
    }

    elements.grid.appendChild(box);
  }
}

function renderHiddenGroup() {
  if (state.hiddenGuessedAnswers.size === 0) return;

  let group = elements.grid.querySelector(".hidden-character-group");

  if (!group) {
    group = createGroup(null);
    group.classList.add("hidden-character-group");
    addSlots(group);
    elements.grid.appendChild(group);
  }

  const slots = group.querySelector(".character-slots");

  for (const [characterId, answer] of state.hiddenGuessedAnswers) {
    const existing = slots.querySelector(`[data-id="${characterId}"]`);
    if (existing && existing.dataset.answer === answer.text) continue;

    const character = hiddenCharacters.find(c => c.id === characterId);
    if (!character) continue;

    const slot = document.createElement("div");
    slot.dataset.id = character.id;
    slot.dataset.answer = answer.text;
    slot.className = "character-slot revealed";

    const img = document.createElement("img");
    img.alt = "";

    const imagePath = answer?.image || character.image;
    if (imagePath) {
      img.src = imagePath;
      img.addEventListener("error", () => {
        img.removeAttribute("src");
        img.style.display = "none";
      });
    } else {
      img.style.display = "none";
    }

    slot.appendChild(img);
    updateSlotAliasTooltip(slot, character, true);

    if (existing) existing.replaceWith(slot);
    else slots.appendChild(slot);
  }
}

function buildSlot(character, groupKey, index) {
  const guessed = Boolean(character) && state.guessedIds.has(character.id);
  const skipped = Boolean(character) && state.skippedIds.has(character.id);
  const gaveUp = Boolean(character) && state.gaveUp && !guessed && !skipped;
  const revealed = guessed || skipped || gaveUp;
  const answer = character ? state.guessedAnswers.get(character.id) : null;
  const imagePath = revealed ? (answer?.image || character.image) : PLACEHOLDER_IMAGE;

  const slot = document.createElement("div");
  slot.dataset.id = character?.id ?? "";
  if (index !== undefined) {
    slot.dataset.group = groupKey ?? "";
    slot.dataset.index = index;
  }
  slot.className = "character-slot";
  slot.classList.toggle("revealed", revealed);
  slot.classList.toggle("skipped", skipped);
  slot.classList.toggle("gave-up", gaveUp);

  const img = document.createElement("img");
  img.src = imagePath || PLACEHOLDER_IMAGE;
  img.alt = "";
  img.addEventListener("error", () => { img.src = PLACEHOLDER_IMAGE; });

  slot.appendChild(img);
  if (character) updateSlotAliasTooltip(slot, character, guessed);
  return slot;
}

function updateSlot(characterId) {
  const character = getCharacter(characterId);
  if (!character) return;

  if (isAnswerSort()) {
    const groupKey = getGroupKey(character) ?? null;
    const order = getGroupAnswerOrder(groupKey);
    const index = order.indexOf(characterId);
    if (index < 0) return;

    const slot = Array.from(elements.grid.querySelectorAll(".character-slot"))
      .find(el => el.dataset.group === (groupKey ?? "") && el.dataset.index === String(index));
    slot?.replaceWith(buildSlot(character, groupKey, index));
    return;
  }

  elements.grid.querySelector(`[data-id="${characterId}"]`)?.replaceWith(buildSlot(character));
}

function isAnswerSort() {
  return state.mode !== "release" && state.sortMode === "answer";
}

function getGroupAnswerOrder(groupKey) {
  return state.answerOrder.filter(id => {
    const character = getCharacter(id);
    return character && (getGroupKey(character) ?? null) === groupKey;
  });
}

function renderGameInfo() {
  const mode = GAME_MODES.find(item => item.id === state.mode);
  elements.gameInfoMode.textContent = mode.label;

  let options = [];
  if (state.mode === "personality") {
    options = PERSONALITY_ORDER.filter(p => state.selectedPersonalities.has(p));
  } else if (state.mode === "race") {
    options = RACE_ORDER.filter(r => state.selectedRaces.has(r));
  } else if (state.mode === "release") {
    options = [state.releaseInitialIncluded ? "출시 초기 사도 포함" : "출시 초기 사도 제외"];
    if (state.releaseReverse) options.push("역순");
  }

  elements.gameInfoOptions.textContent = options.join(" · ");
  elements.skipOptions.textContent = state.hintSolvedCount > 0 ? `힌트 ${state.hintSolvedCount}회 사용` : "";
  elements.timerOptions.textContent = state.activeTimeLimit !== null ? `${state.activeTimeLimit / 60}분` : "";
}

function updateGameControls() {
  const remainingHints = Math.max(state.skipLimit - state.skipCount, 0);
  const hintCharacter = getCharacter(state.hintCharacterId);

  elements.giveUp.disabled = !state.gameStarted;
  elements.giveUp.textContent = state.finished ? "놓친 사도 목록" : "포기하기";

  elements.skip.hidden = state.skipLimit === 0;
  elements.skip.disabled =
    !state.gameStarted ||
    state.finished ||
    Boolean(hintCharacter) ||
    getRemainingCharacters().length === 0 ||
    remainingHints === 0;
  elements.skip.innerHTML = `
    <span class="skip-button-label">힌트</span>
    <span class="skip-button-count">${remainingHints}회 남음</span>
  `;

  elements.hintOverlay.classList.toggle("hidden", !hintCharacter);
  if (hintCharacter) {
    elements.hintOverlayImage.src = hintCharacter.image || PLACEHOLDER_IMAGE;
    positionHintOverlay();
  }

  elements.sound.textContent = state.soundEnabled ? "🔊" : "🔇";
  elements.input.disabled = !state.gameStarted || state.finished;
}

function positionHintOverlay() {
  const panelBottom = $(".game-panel").getBoundingClientRect().bottom;
  elements.hintOverlay.style.setProperty("--hint-top", `${panelBottom + 16}px`);
}

function openModeOverlay() {
  state.modeBackup = {
    ...Object.fromEntries(MODE_KEYS.map(key => [key, state[key]])),
    selectedPersonalities: new Set(state.selectedPersonalities),
    selectedRaces: new Set(state.selectedRaces)
  };

  renderModeOverlay();
  elements.overlay.classList.remove("hidden");
}

function handleCloseMode() {
  if (state.modeBackup) {
    Object.assign(state, state.modeBackup);
    state.modeBackup = null;
  }

  if (!state.gameStarted) {
    startGame();
    return;
  }

  elements.overlay.classList.add("hidden");
  if (!state.finished) elements.input.focus();
}

function openMissedOverlay() {
  elements.missedOverlay.classList.remove("hidden");
  renderMissedList();
}

function closeMissedOverlay() {
  elements.missedOverlay.classList.add("hidden");
}

function renderMissedList() {
  elements.missedList.innerHTML = "";
  elements.missedList.style.paddingBottom = "";

  if (state.missedIds.length === 0) {
    const empty = document.createElement("div");
    empty.className = "missed-empty";
    empty.textContent = "놓친 사도가 없어요! 멋져요!";
    elements.missedList.appendChild(empty);
    return;
  }

  for (const characterId of state.missedIds) {
    const character = getCharacter(characterId);
    if (!character) continue;

    const item = document.createElement("div");
    item.className = "missed-item";

    const img = document.createElement("img");
    img.src = character.image || PLACEHOLDER_IMAGE;
    img.alt = "";
    img.addEventListener("error", () => { img.src = PLACEHOLDER_IMAGE; });

    const name = document.createElement("div");
    name.className = "missed-item-name";
    name.textContent = character.name;

    item.append(img, name);
    updateSlotAliasTooltip(item, character, true);
    elements.missedList.appendChild(item);
  }
  adjustMissedListPadding();
}

function adjustMissedListPadding() {
  const items = [...elements.missedList.querySelectorAll(".missed-item")];
  if (items.length === 0) return;

  const lastTop = items[items.length - 1].offsetTop;
  let max = 0;

  for (const item of items) {
    if (item.offsetTop !== lastTop) continue;
    const tooltip = item.querySelector(".alias-tooltip");
    if (tooltip) max = Math.max(max, tooltip.offsetHeight);
  }

  if (max > 0) elements.missedList.style.paddingBottom = `${max - 8}px`;
}

function startGame() {
  if (state.mode === "personality" && state.selectedPersonalities.size === 0) return;
  if (state.mode === "race" && state.selectedRaces.size === 0) return;
  if (getTargetCharacters().length === 0) return;

  state.activeTimeLimit = state.timeLimited ? state.timeLimitMinutes * 60 : null;

  resetGameState();
  state.gameStarted = true;
  state.modeBackup = null;

  elements.overlay.classList.add("hidden");
  render();
  elements.input.focus();
}

function renderModeOverlay() {
  renderGameModeButtons();
  renderToggleButtons(
    elements.personalityButtons,
    getAvailable(PERSONALITY_ORDER, "personality"),
    state.selectedPersonalities,
    "personality"
  );
  renderToggleButtons(
    elements.raceButtons,
    getAvailable(RACE_ORDER, "race"),
    state.selectedRaces,
    "race"
  );
  renderCategoryButtons();
  renderSortButtons();
  renderReleaseOptions();
  renderTimeOptions();
  bindNumberInput(elements.skipLimitInput, "skipLimit", 0);
  updateModeSections();
}

function createButton(label, active, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.classList.toggle("active", active);
  if (onClick) button.addEventListener("click", onClick);
  return button;
}

function renderGameModeButtons() {
  elements.gameModeButtons.replaceChildren(
    ...GAME_MODES.map(mode => createButton(mode.label, state.mode === mode.id, () => {
      state.mode = mode.id;
      state.sortMode = "answer";
      state.selectedPersonalities.clear();
      state.selectedRaces.clear();
      state.category = { personality: "personality", race: "race", release: "quarter" }[mode.id] ?? "none";
      renderModeOverlay();
    }))
  );
}

function renderToggleButtons(container, items, selected, modeId) {
  if (items.length === 0) {
    const empty = document.createElement("span");
    empty.textContent = "JSON에 등록된 종족이 없습니다.";
    empty.className = "empty-option";
    container.replaceChildren(empty);
    return;
  }

  container.replaceChildren(
    ...items.map(item => createButton(item, selected.has(item), () => {
      if (state.mode !== modeId) return;
      if (selected.has(item)) selected.delete(item);
      else selected.add(item);
      renderModeOverlay();
    }))
  );
}

function renderCategoryButtons() {
  if (state.mode === "personality" || state.mode === "race") {
    const button = createButton(state.mode === "personality" ? "성격" : "종족", true);
    button.disabled = true;
    elements.categoryButtons.replaceChildren(button);
    return;
  }

  const categories = state.mode === "release" ? RELEASE_CATEGORIES : CATEGORIES;
  elements.categoryButtons.replaceChildren(
    ...categories.map(category => createButton(category.label, state.category === category.id, () => {
      state.category = category.id;
      renderModeOverlay();
    }))
  );
}

function renderSortButtons() {
  elements.sortButtons.replaceChildren(
    ...SORT_MODES.map(sort => createButton(sort.label, state.sortMode === sort.id, () => {
      state.sortMode = sort.id;
      renderModeOverlay();
    }))
  );
}

function renderReleaseOptions() {
  elements.releaseInitialIncluded.checked = state.releaseInitialIncluded;
  elements.releaseInitialIncluded.onchange = () => {
    state.releaseInitialIncluded = elements.releaseInitialIncluded.checked;
  };

  elements.releaseReverse.checked = state.releaseReverse;
  elements.releaseReverse.onchange = () => {
    state.releaseReverse = elements.releaseReverse.checked;
  };
}

function bindNumberInput(input, key, min) {
  input.value = state[key];

  input.oninput = () => {
    const value = Math.floor(Number(input.value));
    if (Number.isFinite(value) && value >= min) state[key] = Math.min(value, 999);
  };

  input.onblur = () => {
    input.value = state[key];
  };
}

function renderTimeOptions() {
  const updateActive = () => {
    elements.timeInfiniteButton.classList.toggle("active", !state.timeLimited);
    elements.timeLimitBox.classList.toggle("active", state.timeLimited);
  };

  bindNumberInput(elements.timeLimitInput, "timeLimitMinutes", 1);
  updateActive();

  elements.timeInfiniteButton.onclick = () => {
    state.timeLimited = false;
    updateActive();
  };

  elements.timeLimitBox.onclick = () => elements.timeLimitInput.focus();

  elements.timeLimitInput.onfocus = () => {
    state.timeLimited = true;
    updateActive();
  };
}

function updateModeSections() {
  const isAllMode = state.mode === "all";
  const isReleaseMode = state.mode === "release";

  elements.personalitySection.classList.toggle("hidden", state.mode !== "personality");
  elements.raceSection.classList.toggle("hidden", state.mode !== "race");
  elements.categorySection.classList.remove("hidden");
  elements.categorySection.classList.toggle("locked", !isAllMode && !isReleaseMode);
  elements.sortSection.classList.toggle("hidden", isReleaseMode);
  elements.releaseSection.classList.toggle("hidden", !isReleaseMode);
}

function startTimer() {
  if (state.timerId !== null || state.finished) return;
  state.startedAt = Date.now();
  state.timerId = setInterval(updateTimer, 250);
  updateTimer();
}

function updateTimer() {
  if (state.startedAt === null) return;
  state.elapsedSeconds = Math.floor((Date.now() - state.startedAt) / 1000);

  if (state.activeTimeLimit !== null) {
    const remaining = Math.max(state.activeTimeLimit - state.elapsedSeconds, 0);
    elements.timer.textContent = formatTime(remaining);
    if (remaining <= 0) endGameByReveal("시간이 초과됐어요. 히잉...");
    return;
  }

  elements.timer.textContent = formatTime(state.elapsedSeconds);
}

function stopTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function formatTime(seconds) {
  const min = Math.floor(seconds / 60).toString().padStart(2, "0");
  const sec = (seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function initializeCanvas() {
  const resizeCanvas = () => {
    elements.canvas.width = window.innerWidth;
    elements.canvas.height = window.innerHeight;
  };
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
}

function triggerFireworks() {
  clearFireworks();

  const ctx = elements.canvas.getContext("2d");
  const width = elements.canvas.width;
  const height = elements.canvas.height;
  const colors = ["#ff4d4d", "#ffcd39", "#4deb90", "#38b6ff", "#ab70ff", "#ff70a6"];

  const particles = Array.from({ length: 120 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 12 + 3;
    return {
      x: width / 2,
      y: height / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      color: pick(colors),
      radius: Math.random() * 4 + 2
    };
  });

  function animate() {
    ctx.clearRect(0, 0, width, height);
    let alive = false;

    for (const p of particles) {
      if (p.alpha <= 0) continue;
      alive = true;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.alpha -= 0.012;

      ctx.save();
      ctx.globalAlpha = Math.max(p.alpha, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (alive) {
      fireworksAnimationId = requestAnimationFrame(animate);
    } else {
      clearFireworks();
    }
  }

  animate();
}

function clearFireworks() {
  if (fireworksAnimationId) {
    cancelAnimationFrame(fireworksAnimationId);
    fireworksAnimationId = null;
  }
  elements.canvas.getContext("2d").clearRect(0, 0, elements.canvas.width, elements.canvas.height);
}

function playAudio(path) {
  const audio = new Audio(encodeURI(path));
  audio.play()?.catch(error => console.warn("Playback failed:", error));
  return audio;
}

function playSound(path) {
  if (state.soundEnabled && path) playAudio(path);
}

function playRandomVoice(voicePaths) {
  if (!state.soundEnabled) return;
  stopVoice();
  currentVoiceAudio = playAudio(pick(voicePaths));
}

function stopVoice() {
  if (!currentVoiceAudio) return;
  currentVoiceAudio.pause();
  currentVoiceAudio.removeAttribute("src");
  currentVoiceAudio.load();
  currentVoiceAudio = null;
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  if (!state.soundEnabled) stopVoice();
  updateGameControls();
}

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  elements.theme.textContent = dark ? "🌙" : "☀️";
}

function toggleTheme() {
  const dark = document.documentElement.dataset.theme !== "dark";
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  applyTheme(dark);
}

function toggleAliasTooltips() {
  state.aliasTooltipsEnabled = !state.aliasTooltipsEnabled;
  updateAliasTooltipButton();
  updateAllAliasTooltips();
}

function updateAliasTooltipButton() {
  const button = elements.aliasTooltipButton;

  button.classList.toggle("active", state.aliasTooltipsEnabled);
  button.setAttribute("aria-pressed", String(state.aliasTooltipsEnabled));
  button.setAttribute("aria-label", state.aliasTooltipsEnabled ? "별명 표시 끄기" : "별명 표시 켜기");
}

function toggleSensitiveAliases() {
  state.sensitiveAliasesEnabled = !state.sensitiveAliasesEnabled;
  updateSensitiveAliasButton();
  updateAllAliasTooltips();
}

function updateSensitiveAliasButton() {
  const button = elements.sensitiveAliasButton;

  button.classList.toggle("active", state.sensitiveAliasesEnabled);
  button.setAttribute("aria-pressed", String(state.sensitiveAliasesEnabled));
  button.setAttribute("aria-label", state.sensitiveAliasesEnabled ? "민감한 별명 끄기" : "민감한 별명 켜기");
}

function updateAllAliasTooltips() {
  for (const slot of elements.grid.querySelectorAll(".character-slot")) {
    const isHidden = Boolean(slot.closest(".hidden-character-group"));
    const characterId = slot.dataset.id;

    const character = isHidden
      ? hiddenCharacters.find(c => c.id === characterId)
      : getCharacter(characterId);

    if (!character) continue;

    const guessed = isHidden
      ? state.hiddenGuessedAnswers.has(character.id)
      : state.guessedIds.has(character.id);

    updateSlotAliasTooltip(slot, character, guessed);
  }
}

function updateSlotAliasTooltip(slot, character, guessed) {
  slot.querySelector(".alias-tooltip")?.remove();

  if (!state.aliasTooltipsEnabled || !guessed) return;

  const aliasLists = [character.aliases];
  if (state.sensitiveAliasesEnabled) aliasLists.push(character.aliases_sensitive);

  const aliases = aliasLists.flatMap(list =>
    Array.isArray(list)
      ? list
          .filter(alias => alias && typeof alias.text === "string" && alias.text)
          .map(alias => alias.text)
      : []
  );

  const tooltip = document.createElement("span");
  tooltip.className = "alias-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.textContent = aliases.length > 0 ? aliases.join("\n") : "없음";

  slot.appendChild(tooltip);
}

function isSpaceAnswer(text) {
  return typeof text === "string" && text.length > 0 && !text.trim();
}

function normalize(text) {
  return String(text ?? "").trim().replace(/[\s-]+/g, "").toLocaleLowerCase();
}

function compareById(a, b) {
  const aId = Number(a.id);
  const bId = Number(b.id);
  if (Number.isFinite(aId) && Number.isFinite(bId)) return aId - bId;
  return a.id.localeCompare(b.id);
}

function getReleaseYear(releaseTerm) {
  const value = Number(releaseTerm);
  if (!Number.isInteger(value)) return null;
  const year = Math.floor(value / 10);
  return year < 0 ? null : year;
}

function getReleaseQuarter(releaseTerm) {
  const value = Number(releaseTerm);
  if (!Number.isInteger(value)) return null;
  const quarter = value % 10;
  return quarter < 1 || quarter > 4 ? null : quarter;
}

function isReleaseInitialCharacter(character) {
  return getReleaseYear(character.releaseTerm) === 0;
}

function hasValidTerm(character) {
  return getReleaseYear(character.releaseTerm) !== null && getReleaseQuarter(character.releaseTerm) !== null;
}

function getAvailable(order, key) {
  return order.filter(value => characters.some(c => c[key] === value));
}

function getTargetCharacters() {
  let result = [...characters];

  if (state.mode === "personality") {
    result = result.filter(c => state.selectedPersonalities.has(c.personality));
  } else if (state.mode === "race") {
    result = result.filter(c => state.selectedRaces.has(c.race));
  } else if (state.mode === "release" && !state.releaseInitialIncluded) {
    result = result.filter(c => !isReleaseInitialCharacter(c));
  }

  return result;
}

function getRemainingCharacters() {
  return getTargetCharacters().filter(
    c => !state.guessedIds.has(c.id) && !state.skippedIds.has(c.id)
  );
}

function getVisibleCharacters() {
  const result = getTargetCharacters();

  const byList = (list, key) => (a, b) => {
    const rank = value => {
      const index = list.indexOf(value);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    const x = rank(a[key]);
    const y = rank(b[key]);
    return x !== y ? x - y : compareById(a, b);
  };

  if (state.mode === "release") {
    if (state.category === "quarter") {
      result.sort((a, b) => {
        const aValid = hasValidTerm(a);
        const bValid = hasValidTerm(b);
        if (aValid !== bValid) return aValid ? -1 : 1;
        if (!aValid) return compareById(a, b);
        return Number(a.releaseTerm) - Number(b.releaseTerm) || compareById(a, b);
      });
    } else {
      result.sort((a, b) => Number(a.releaseOrder) - Number(b.releaseOrder) || compareById(a, b));
    }
  } else if (state.category === "personality") {
    result.sort(byList(PERSONALITY_ORDER, "personality"));
  } else if (state.category === "race") {
    result.sort(byList(RACE_ORDER, "race"));
  } else {
    result.sort(compareById);
  }

  return result;
}

function getGroupKey(character) {
  if (state.category === "personality") return character.personality;
  if (state.category === "race") return character.race;
  return null;
}

function getAnswers(character) {
  const answers = [{
    text: character.name,
    image: character.image ?? null,
    sound: character.sound ?? null
  }];

  const aliasLists = [character.aliases];
  if (state.sensitiveAliasesEnabled) aliasLists.push(character.aliases_sensitive);

  for (const list of aliasLists) {
    if (!Array.isArray(list)) continue;
    for (const alias of list) {
      if (!alias || typeof alias.text !== "string") continue;
      answers.push({
        text: alias.text,
        image: alias.image ?? character.image ?? null,
        sound: alias.sound ?? character.sound ?? null
      });
    }
  }

  const seen = new Set(answers.map(a => normalize(a.text)));

  for (const answer of [...answers]) {
    if (!/[()（）]/.test(answer.text)) continue;

    const stripped = answer.text.replace(/[()（）]/g, "");
    const key = normalize(stripped);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    answers.push({ ...answer, text: stripped });
  }

  return answers;
}

function canRevealCharacter(character) {
  if (state.mode !== "release") return true;

  const remaining = getRemainingCharacters();

  if (state.releaseReverse) {
    if (remaining.length === 0) return false;

    if (isReleaseInitialCharacter(character)) {
      return state.releaseInitialIncluded && remaining.every(isReleaseInitialCharacter);
    }

    const remainingNormal = remaining.filter(c => !isReleaseInitialCharacter(c));
    if (remainingNormal.length === 0) return true;

    return Number(character.releaseOrder) >= Math.max(...remainingNormal.map(c => Number(c.releaseOrder)));
  }

  if (isReleaseInitialCharacter(character)) return state.releaseInitialIncluded;
  if (remaining.length === 0) return false;

  return Number(character.releaseOrder) <= Math.min(...remaining.map(c => Number(c.releaseOrder)));
}

function initializeKeyboardViewport() {
  const appContainer = $(".app");
  const input = elements.input;

  if (!appContainer || !window.visualViewport) return;

  function handleViewportResize() {
    const keyboardHeight = window.innerHeight - window.visualViewport.height;
    appContainer.style.paddingBottom = keyboardHeight > 150 ? `${keyboardHeight + 20}px` : "";
  }

  window.visualViewport.addEventListener("resize", handleViewportResize);
  input.addEventListener("focus", () => setTimeout(handleViewportResize, 100));
  input.addEventListener("blur", () => {
    setTimeout(() => { appContainer.style.paddingBottom = ""; }, 100);
  });
}

const elements = {
    sidebar: document.querySelector("#sidebar"),
    details: document.querySelector("#details"),
    backdrop: document.querySelector("#backdrop"),
    openNavigation: document.querySelector("#open-navigation"),
    openDetails: document.querySelector("#open-details"),
    closeDetails: document.querySelector("#close-details"),
    newChat: document.querySelector("#new-chat"),
    welcome: document.querySelector("#welcome"),
    messageList: document.querySelector("#message-list"),
    conversation: document.querySelector("#conversation"),
    composer: document.querySelector("#composer"),
    input: document.querySelector("#question-input"),
    send: document.querySelector("#send-button"),
    modelPill: document.querySelector("#model-pill"),
    modelStatus: document.querySelector("#model-status"),
    retryModel: document.querySelector("#retry-model"),
    emptyDetails: document.querySelector("#empty-details"),
    detailContent: document.querySelector("#detail-content"),
    detailTopic: document.querySelector("#detail-topic"),
    detailConfidence: document.querySelector("#detail-confidence"),
    detailSource: document.querySelector("#detail-source"),
    detailSourceCopy: document.querySelector("#detail-source-copy"),
    matchBlock: document.querySelector("#match-block"),
    detailMatch: document.querySelector("#detail-match"),
    detailScore: document.querySelector("#detail-score"),
    attentionHeads: document.querySelector("#attention-heads"),
    knowledgeEntries: document.querySelector("#knowledge-entries"),
    modelLoadTime: document.querySelector("#model-load-time"),
    responseTime: document.querySelector("#response-time"),
        activeSubjectTitle: document.querySelector(
        "#active-subject-title"
    ),
    welcomeCopy: document.querySelector("#welcome-copy"),
    suggestionButtons: Array.from(
        document.querySelectorAll(
            ".suggestions [data-question]"
        )
    ),
    subjectButtons: Array.from(
        document.querySelectorAll("[data-subject]")
    ),
};


const sourceLabels = {
    extractive_rag: "Structured knowledge",
    generative_rag: "Generative RAG",
    transformer: "Transformer fallback",
};

const sourceDescriptions = {
    extractive_rag:
        "A highly relevant answer was selected from KeyIdea's structured knowledge base.",
    generative_rag:
        "The model generated an answer using retrieved educational context.",
    transformer:
        "No sufficiently close stored answer was found, so the Transformer generated a response.",
};

const SUBJECT_INTERFACE = {
    Mathematics: {
        questionNoun: "mathematics",
        welcomeCopy:
            "Ask a mathematics question and receive a focused answer from a custom AI built from scratch in C++.",
        suggestions: [
            "What is a prime number",
            "What is the area of a triangle",
            "Explain the difference between sine and cosine",
        ],
    },
    Physics: {
        questionNoun: "physics",
        welcomeCopy:
            "Ask a physics question and receive a focused answer from a custom AI built from scratch in C++.",
        suggestions: [
            "What is acceleration",
            "What is electric current",
            "What is kinetic energy",
        ],
    },
};

function getSubjectInterface() {
    return SUBJECT_INTERFACE[activeSubjectName] ??
        SUBJECT_INTERFACE.Mathematics;
}

function getSourceLabel(source) {
    if (source === "scope_guard") {
        return `${activeSubjectName} scope guard`;
    }

    return sourceLabels[source] ?? source;
}

function getSourceDescription(source) {
    if (source === "scope_guard") {
        return `The question was detected outside the currently supported ${getSubjectInterface().questionNoun} scope.`;
    }

    return sourceDescriptions[source] ??
        "KeyIdea selected the best available response path.";
}

const MODEL_LOAD_TIMEOUT_MILLISECONDS = 30000;
const RESPONSE_TIMEOUT_MILLISECONDS = 15000;
const MAXIMUM_QUESTION_CHARACTERS = 240;

let modelReady = false;
let modelFailed = false;
let requestPending = false;
let nextRequestId = 1;
let activeRequestId = null;
let thinkingMessage = null;
let lastPanelTrigger = null;
let responseTimeout = null;

let activeSubjectName = "Mathematics";

function updateSubjectInterface() {
    const subjectInterface = getSubjectInterface();

    elements.welcomeCopy.textContent =
        subjectInterface.welcomeCopy;

    elements.suggestionButtons.forEach(
        (button, index) => {
            const question =
                subjectInterface.suggestions[index];

            button.dataset.question = question;
            button.querySelector("span").textContent =
                question;
        }
    );

    elements.input.setAttribute(
        "aria-label",
        `Ask a ${subjectInterface.questionNoun} question`
    );
}

const worker = new Worker("./keyidea-worker.js");
const modelLoadTimeout = window.setTimeout(() => {
    worker.terminate();
    modelReady = false;
    requestPending = false;
    activeRequestId = null;
    setModelState("error", "Loading timed out");
    updateComposer();
}, MODEL_LOAD_TIMEOUT_MILLISECONDS);

function clearResponseTimeout() {
    if (responseTimeout !== null) {
        window.clearTimeout(responseTimeout);
        responseTimeout = null;
    }
}

function startResponseTimeout() {
    clearResponseTimeout();

    responseTimeout = window.setTimeout(() => {
        worker.terminate();
        thinkingMessage?.remove();
        thinkingMessage = null;
        requestPending = false;
        activeRequestId = null;
        modelReady = false;
        elements.conversation.setAttribute("aria-busy", "false");
        setModelState("error", "Response timed out");
        updateComposer();
    }, RESPONSE_TIMEOUT_MILLISECONDS);
}

function formatDuration(milliseconds) {
    if (milliseconds < 1000) {
        return `${milliseconds.toFixed(0)} ms`;
    }

    return `${(milliseconds / 1000).toFixed(2)} s`;
}

function setModelState(state, label) {
    elements.modelPill.classList.toggle("loading", state === "loading");
    elements.modelPill.classList.toggle("error", state === "error");
    elements.modelStatus.textContent = label;
    modelFailed = state === "error";
    elements.retryModel.hidden = !modelFailed;
}

function updateComposer() {
    elements.input.disabled = !modelReady || requestPending;
    elements.send.disabled = !modelReady || requestPending || elements.input.value.trim().length === 0;

    if (modelFailed) {
        elements.input.placeholder =
            "The model could not load. Select Try again.";
    } else if (!modelReady) {
        elements.input.placeholder = "Loading the KeyIdea model...";
    } else if (requestPending) {
        elements.input.placeholder = "KeyIdea is preparing an answer...";
    } else {
                elements.input.placeholder =
            `Ask a ${getSubjectInterface().questionNoun} question...`;
    }
}

function applySubjectMetadata(metadata) {
    const activeSubject = metadata.activeSubject;
    activeSubjectName = activeSubject;
    updateSubjectInterface();

    const availability =
        metadata.subjectAvailability ?? {};

    elements.activeSubjectTitle.textContent =
        activeSubject;

    elements.subjectButtons.forEach((button) => {
        const subjectName = button.dataset.subject;
        const available =
            availability[subjectName] === true;
        const active =
            subjectName === activeSubject;
        const status =
            button.querySelector("[data-subject-status]");

        button.disabled =
            !modelReady ||
            !available ||
            active ||
            requestPending;

        button.classList.toggle("active", active);
        button.classList.toggle("muted", !active);

        if (status !== null) {
            status.textContent =
                active
                    ? "Active"
                    : available
                        ? "Available"
                        : "Soon";
        }
    });
}

function showConversation() {
    elements.welcome.hidden = false;
    elements.conversation.classList.add("has-messages");
    elements.messageList.hidden = false;
}

function scrollToLatest() {
    requestAnimationFrame(() => {
        elements.conversation.scrollTo({
            top: elements.conversation.scrollHeight,
            behavior: "smooth",
        });
    });
}

function deactivateNeuralMarks() {
    document.querySelectorAll(".neural-mark.is-latest").forEach((mark) => {
        mark.classList.remove("is-latest");
    });
}

function createNeuralMark() {
    const mark = document.createElement("span");
    mark.className = "neural-mark is-latest";
    mark.setAttribute("aria-hidden", "true");

    const leftLobe = document.createElement("i");
    leftLobe.className = "neural-lobe left";

    const rightLobe = document.createElement("i");
    rightLobe.className = "neural-lobe right";

    const bridge = document.createElement("i");
    bridge.className = "neural-bridge";

    mark.append(leftLobe, rightLobe, bridge);

    ["one", "two", "three", "four"].forEach((position) => {
        const node = document.createElement("i");
        node.className = `neural-node ${position}`;
        mark.append(node);
    });

    return mark;
}

function appendUserMessage(text) {
    const article = document.createElement("article");
    article.className = "message user";

    const body = document.createElement("div");
    body.className = "message-body";

    const label = document.createElement("span");
    label.className = "message-label";
    label.textContent = "You";

    const paragraph = document.createElement("p");
    paragraph.textContent = text;

    body.append(label, paragraph);
    article.append(body);
    elements.messageList.append(article);
}

function appendThinkingMessage() {
    deactivateNeuralMarks();

    const article = document.createElement("article");
    article.className = "message assistant";

    const body = document.createElement("div");
    body.className = "message-body";

    const label = document.createElement("span");
    label.className = "message-label";
    label.textContent = "KeyIdea is thinking";

    const dots = document.createElement("div");
    dots.className = "thinking-dots";
    dots.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));

    body.append(label, dots);
    article.append(createNeuralMark(), body);
    elements.messageList.append(article);
    thinkingMessage = article;
}

function appendAssistantMessage(response) {
    deactivateNeuralMarks();

    const article = document.createElement("article");
    article.className = "message assistant";

    const body = document.createElement("div");
    body.className = "message-body";

    const label = document.createElement("span");
    label.className = "message-label";
    label.textContent = "KeyIdea";

    const paragraph = document.createElement("p");
    paragraph.textContent = response.text;

    const tags = document.createElement("div");
    tags.className = "message-tags";

    const topicTag = document.createElement("span");
    topicTag.textContent = displayTopic(response);

    const sourceTag = document.createElement("span");
    sourceTag.textContent = getSourceLabel(response.source);

    tags.append(topicTag, sourceTag);
    body.append(label, paragraph, tags);
    article.append(createNeuralMark(), body);
    elements.messageList.append(article);
}

function displayTopic(response) {
    if (response.source === "scope_guard") {
        return `Outside ${getSubjectInterface().questionNoun} scope`;
    }

    if (!response.hasTopic) {
        return "Topic unavailable";
    }

    return response.topicAccepted
        ? response.topic
        : `Uncertain · ${response.bestTopic}`;
}

function displayConfidence(response) {
    if (
        !response.hasTopic ||
        response.source === "scope_guard"
    ) {
        return "—";
    }

    return `${(response.topicConfidence * 100).toFixed(1)}%`;
}

function updateDetails(response) {
    elements.emptyDetails.hidden = true;
    elements.detailContent.hidden = false;
    elements.detailTopic.textContent = displayTopic(response);
    elements.detailConfidence.textContent = displayConfidence(response);
        elements.detailSource.textContent =
        getSourceLabel(response.source);

    elements.detailSourceCopy.textContent =
        getSourceDescription(response.source);

    elements.matchBlock.hidden = !response.hasExtractiveAnswer;

    if (response.hasExtractiveAnswer) {
        elements.detailMatch.textContent = `“${response.matchedQuestion}”`;
        elements.detailScore.textContent = `${(response.relevanceScore * 100).toFixed(1)}%`;
    }
}

function askQuestion(question) {
    const cleanQuestion = question
        .trim()
        .replace(/\s+/g, " ");

    if (
        !modelReady ||
        requestPending ||
        cleanQuestion.length === 0 ||
        cleanQuestion.length > MAXIMUM_QUESTION_CHARACTERS
    ) {
        return;
    }

    showConversation();
    appendUserMessage(cleanQuestion);
    appendThinkingMessage();
    scrollToLatest();

    requestPending = true;
    elements.conversation.setAttribute("aria-busy", "true");
    elements.input.value = "";
    updateComposer();

    activeRequestId = nextRequestId++;

    worker.postMessage({
        type: "ask",
        requestId: activeRequestId,
        question: cleanQuestion,
    });

    startResponseTimeout();
}

function clearConversation() {
    elements.messageList.replaceChildren();
    elements.messageList.hidden = true;
    elements.welcome.hidden = false;
    elements.conversation.classList.remove("has-messages");
    elements.conversation.scrollTop = 0;
    elements.emptyDetails.hidden = false;
    elements.detailContent.hidden = true;
    elements.input.value = "";
    thinkingMessage = null;
    requestPending = false;
    activeRequestId = null;
    clearResponseTimeout();
    elements.conversation.setAttribute("aria-busy", "false");
    updateComposer();
    worker.postMessage({ type: "newConversation" });
    closePanels();
    elements.input.focus();
}

function openPanel(panel, trigger) {
    closePanels();
    lastPanelTrigger = trigger;
    panel.classList.add("mobile-open");
    elements.backdrop.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    panel.focus();
}

function closePanels(restoreFocus = false) {
    elements.sidebar.classList.remove("mobile-open");
    elements.details.classList.remove("mobile-open");
    elements.backdrop.hidden = true;
    elements.openNavigation.setAttribute("aria-expanded", "false");
    elements.openDetails.setAttribute("aria-expanded", "false");

    if (restoreFocus && lastPanelTrigger !== null) {
        lastPanelTrigger.focus();
    }

    lastPanelTrigger = null;
}

worker.onmessage = (event) => {
    const message = event.data;

    if (message.type === "status") {
        setModelState("loading", "Loading model");
        return;
    }

    if (message.type === "ready") {
        window.clearTimeout(modelLoadTimeout);
        modelReady = true;
        modelFailed = false;
        setModelState("ready", "Model ready");
        elements.attentionHeads.textContent = message.metadata.attentionHeads.toLocaleString();
        elements.knowledgeEntries.textContent = message.metadata.knowledgeEntries.toLocaleString();
        elements.modelLoadTime.textContent = formatDuration(message.metadata.loadMilliseconds);
        applySubjectMetadata(message.metadata);
        updateComposer();
        elements.input.focus();
        return;
    }

    if (message.type === "subjectSelected") {
        modelReady = true;
        requestPending = false;
        setModelState("ready", "Model ready");
        applySubjectMetadata(message.metadata);
        elements.attentionHeads.textContent =
            message.metadata.attentionHeads.toLocaleString();
        elements.knowledgeEntries.textContent =
            message.metadata.knowledgeEntries.toLocaleString();
        clearConversation();
        updateComposer();
        return;
    }

    if (message.type === "answer") {
        if (message.requestId !== activeRequestId) {
            return;
        }

        thinkingMessage?.remove();
        thinkingMessage = null;
        activeRequestId = null;
        clearResponseTimeout();
        appendAssistantMessage(message.response);
        updateDetails(message.response);
        elements.responseTime.textContent = formatDuration(message.responseMilliseconds);
        requestPending = false;
        elements.conversation.setAttribute("aria-busy", "false");
        updateComposer();
        scrollToLatest();
        elements.input.focus();
        return;
    }

    if (message.type === "error") {
        if (
            message.requestId !== null &&
            message.requestId !== activeRequestId
        ) {
            return;
        }

        thinkingMessage?.remove();
        thinkingMessage = null;
        requestPending = false;
        activeRequestId = null;
        clearResponseTimeout();
        elements.conversation.setAttribute("aria-busy", "false");

        if (message.fatal) {
            window.clearTimeout(modelLoadTimeout);
            modelReady = false;
            setModelState("error", "Model error");
        } else {
            appendAssistantMessage({
                text: "I could not process that question. Please try again.",
                source: "transformer",
                outsideSubjectScope: false,
                hasTopic: false,
            });
        }

        updateComposer();
        console.error("KeyIdea worker error:", message.message);
    }
};

worker.onerror = (error) => {
    window.clearTimeout(modelLoadTimeout);
    clearResponseTimeout();
    requestPending = false;
    modelReady = false;
    elements.conversation.setAttribute("aria-busy", "false");
    setModelState("error", "Model error");
    updateComposer();
    console.error("KeyIdea worker failure:", error);
};

elements.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    askQuestion(elements.input.value);
});

elements.input.addEventListener("input", updateComposer);
elements.newChat.addEventListener("click", clearConversation);
elements.retryModel.addEventListener("click", () => {
    window.location.reload();
});
elements.openNavigation.addEventListener("click", () => {
    openPanel(elements.sidebar, elements.openNavigation);
});
elements.openDetails.addEventListener("click", () => {
    openPanel(elements.details, elements.openDetails);
});
elements.closeDetails.addEventListener("click", () => closePanels(true));
elements.backdrop.addEventListener("click", () => closePanels(true));

document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        !elements.backdrop.hidden
    ) {
        closePanels(true);
    }
});

document.querySelectorAll("[data-question]").forEach((button) => {
    button.addEventListener("click", () => {
        askQuestion(button.dataset.question);
    });
});

elements.subjectButtons.forEach((button) => {
    button.addEventListener("click", () => {
        if (
            button.disabled ||
            !modelReady ||
            requestPending
        ) {
            return;
        }

        modelReady = false;
        requestPending = true;
        setModelState(
            "loading",
            `Loading ${button.dataset.subject}`
        );
        updateComposer();

        worker.postMessage({
            type: "selectSubject",
            subjectName: button.dataset.subject,
        });
    });
});

window.addEventListener("beforeunload", () => {
    window.clearTimeout(modelLoadTimeout);
    clearResponseTimeout();
    worker.terminate();
});
updateComposer();

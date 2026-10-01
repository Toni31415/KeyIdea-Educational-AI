let keyIdeaModule = null;
let keyIdeaBridge = null;
const initializationStartTime = performance.now();
const MAXIMUM_QUESTION_CHARACTERS = 240;
const SUBJECT_NAMES = [
    "Mathematics",
    "Physics",
    "Informatics",
];


function postFailure(
    error,
    requestId = null,
    fatal = false
) {
    const message =
        error instanceof Error
            ? error.message
            : String(error);

    self.postMessage({
        type: "error",
        message,
        requestId,
        fatal,
    });
}

function getSubjectMetadata() {
    const availability = {};

    SUBJECT_NAMES.forEach((subjectName) => {
        availability[subjectName] =
            keyIdeaBridge.isSubjectAvailable(subjectName);
    });

    return {
        activeSubject:
            keyIdeaBridge.getActiveSubjectDisplayName(),
        subjectAvailability: availability,
        attentionHeads:
            keyIdeaBridge.getAttentionHeadCount(),
        knowledgeEntries:
            keyIdeaBridge.getKnowledgeEntryCount(),
        knowledgeChunks:
            keyIdeaBridge.getKnowledgeChunkCount(),
    };
}

async function initialize() {
    self.postMessage({
        type: "status",
        status: "loading",
    });

    importScripts("./engine/keyidea.js");

    keyIdeaModule = await createKeyIdeaModule({
        locateFile(fileName) {
            return new URL(
                `./engine/${fileName}`,
                self.location.href
            ).href;
        },
    });

    keyIdeaBridge = new keyIdeaModule.KeyIdeaWebBridge(
        "/assets"
    );

    self.postMessage({
        type: "ready",
        metadata: {
            ...getSubjectMetadata(),
            loadMilliseconds:
                performance.now() - initializationStartTime,
        },
    });
}


self.onmessage = (event) => {
    const request = event.data;

    try {
        if (request.type === "ask") {
            if (keyIdeaBridge === null) {
                throw new Error(
                    "KeyIdea is still loading."
                );
            }

            if (
                typeof request.question !== "string" ||
                request.question.length === 0 ||
                request.question.length >
                    MAXIMUM_QUESTION_CHARACTERS
            ) {
                throw new Error(
                    "Question length is outside the supported range."
                );
            }

            const responseStartTime = performance.now();

            const response = keyIdeaBridge.ask(
                request.question
            );

            const responseMilliseconds =
                performance.now() - responseStartTime;

            self.postMessage({
                type: "answer",
                requestId: request.requestId,
                response,
                responseMilliseconds,
            });

            return;
        }

        if (request.type === "newConversation") {
            if (keyIdeaBridge !== null) {
                keyIdeaBridge.startNewConversation();
            }

            self.postMessage({
                type: "conversationCleared",
            });

            return;
        }

        if (request.type === "selectSubject") {
            if (keyIdeaBridge === null) {
                throw new Error(
                    "KeyIdea is still loading."
                );
            }

            keyIdeaBridge.selectSubject(
                request.subjectName
            );

            self.postMessage({
                type: "subjectSelected",
                metadata: getSubjectMetadata(),
            });
        }
    } catch (error) {
        postFailure(
            error,
            request.requestId ?? null,
            false
        );
    }
};


initialize().catch((error) => {
    postFailure(
        error,
        null,
        true
    );
});

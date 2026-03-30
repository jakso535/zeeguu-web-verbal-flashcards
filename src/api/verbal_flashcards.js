// Frontend API client for verbal flashcards
import { Zeeguu_API } from "./classDef";

Zeeguu_API.prototype.getFlashcards = function (params, callback) {
    const { category, difficulty, limit, offset } = params || {};
    let url = `verbal_flashcards?`;

    if (category) url += `category=${encodeURIComponent(category)}&`;
    if (difficulty) url += `difficulty=${encodeURIComponent(difficulty)}&`;
    if (limit) url += `limit=${limit}&`;
    if (offset) url += `offset=${offset}&`;

    this._getJSON(url.slice(0, -1), callback);
};

Zeeguu_API.prototype.getFlashcardById = function (id, callback) {
    this._getJSON(`verbal_flashcards/${id}`, callback);
};

Zeeguu_API.prototype.getFlashcardCategories = function (callback) {
    this._getJSON(`verbal_flashcards/categories`, callback);
};

Zeeguu_API.prototype.getPracticeSet = function (count, callback) {
    this._getJSON(`verbal_flashcards/practice?count=${count || 10}`, callback);
};

Zeeguu_API.prototype.submitFlashcardAnswer = function (flashcardId, userAnswer, isCorrect, answerSource, responseTimeMs, callback) {
    const payload = {
        flashcard_id: flashcardId,
        user_answer: userAnswer,
        is_correct: isCorrect,
        answer_source: answerSource,
        response_time_ms: responseTimeMs
    };

    this._post(`verbal_flashcards/submit`, JSON.stringify(payload), callback, null, true);
};

Zeeguu_API.prototype.transcribeAudio = function (audioFile, flashcardId, callback) {
    const formData = new FormData();
    formData.append('file', audioFile);
    if (flashcardId) {
        formData.append('flashcard_id', flashcardId);
    }

    fetch(this._appendSessionToUrl('verbal_flashcards/transcribe'), {
        method: 'POST',
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            if (callback) callback(data);
        })
        .catch(error => {
            console.error('Transcription error:', error);
            if (callback) callback({ error: error.message });
        });
};
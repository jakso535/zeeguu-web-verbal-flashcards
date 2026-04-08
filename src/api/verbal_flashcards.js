// Frontend API client for verbal flashcards
import { Zeeguu_API } from "./classDef";


Zeeguu_API.prototype.getFlashcards = function (params, callback) {
   const { limit, offset } = params || {};
   let url = `verbal_flashcards?`;
  
   if (limit) url += `limit=${limit}&`;
   if (offset) url += `offset=${offset}&`;


   this._getJSON(url.slice(0, -1), callback);
};


Zeeguu_API.prototype.submitFlashcardAnswer = function (flashcardId, userAnswer, isCorrect, answerSource, responseTimeMs, callback) {
   const payload = {
       flashcard_id: flashcardId,
       user_answer: userAnswer,
       is_correct: isCorrect,
       answer_source: answerSource,
       response_time_ms: responseTimeMs
   };


   fetch(this._appendSessionToUrl('verbal_flashcards/submit'), {
       method: 'POST',
       headers: {
           'Content-Type': 'application/json'
       },
       body: JSON.stringify(payload),
   })
       .then(response => response.json())
       .then(data => {
           if (callback) callback(data);
       })
       .catch(error => {
           console.error('Submit error:', error);
           if (callback) callback({ error: error.message });
       });
};


Zeeguu_API.prototype.transcribeAudio = function (audioFile, flashcardId, callback) {
   const formData = new FormData();
   formData.append('file', audioFile);
   if (flashcardId) {
       formData.append('flashcard_id', flashcardId);
   }


   fetch(this._appendSessionToUrl('verbal_flashcards/transcribe'), {
       method: 'POST',
       body: formData,
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


Zeeguu_API.prototype.checkPronunciation = function (userSpeech, expectedText, callback) {
   const payload = {
       user_speech: userSpeech,
       expected_text: expectedText
   };


   fetch(this._appendSessionToUrl('verbal_flashcards/check_pronunciation'), {
       method: 'POST',
       headers: {
           'Content-Type': 'application/json'
       },
       body: JSON.stringify(payload),
   })
       .then(response => response.json())
       .then(data => {
           if (callback) callback(data);
       })
       .catch(error => {
           console.error('Pronunciation check error:', error);
           if (callback) callback({ error: error.message });
       });
};

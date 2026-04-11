import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { APIContext } from '../contexts/APIContext';
import { UserContext } from '../contexts/UserContext';
import * as s from './verbalFlashcards_Styled/VerbalFlashcards.sc.js';

export default function VerbalFlashcardsPage() {
    const api = useContext(APIContext);
    const { userDetails } = useContext(UserContext);
    const history = useHistory();

    // State
    const [flashcards, setFlashcards] = useState([]);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isReseeding, setIsReseeding] = useState(false);
    const [totalScore, setTotalScore] = useState(0);
    const [currentStreak, setCurrentStreak] = useState(0);
    const [showResult, setShowResult] = useState(false);
    const [userSpeech, setUserSpeech] = useState('');
    const [accuracyResult, setAccuracyResult] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isCooldown, setIsCooldown] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Loading...');
    const [statusType, setStatusType] = useState('idle');
    const [noiseSensitivity, setNoiseSensitivity] = useState('0.08');
    const [correctBookmarks, setCorrectBookmarks] = useState([]);
    const [incorrectBookmarks, setIncorrectBookmarks] = useState([]);
    const [totalPracticedBookmarksInSession, setTotalPracticedBookmarksInSession] = useState(0);

    // Refs
    const mediaRecorderRef = useRef(null);
    const micStreamRef = useRef(null);
    const audioChunksRef = useRef([]);

    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const dataArrayRef = useRef(null);
    const animationFrameRef = useRef(null);

    const statusUpdateTimeoutRef = useRef(null);
    const cooldownTimeoutRef = useRef(null);
    const countdownIntervalRef = useRef(null);
    const interCardDelayTimeoutRef = useRef(null);

    const currentCardIndexRef = useRef(0);
    const flashcardsRef = useRef([]);
    const isRecordingRef = useRef(false);
    const isCooldownRef = useRef(false);
    const isStartingRecordingRef = useRef(false);
    const shouldProcessRecordingOnStopRef = useRef(false);

    const lastVoiceDetectedAtRef = useRef(0);
    const voiceStartedAtRef = useRef(0);
    const recordingStartedAtRef = useRef(0);

    const ttsAudioRef = useRef(null);
    const isPlayingTtsRef = useRef(false);
    const exerciseSessionIdRef = useRef(null);
    const pageSessionStartedAtRef = useRef(null);
    const sessionEndedRef = useRef(false);
    const attemptCountsRef = useRef({});
    const beginCardFlowRef = useRef(() => {});
    const flowRunIdRef = useRef(0);
    const isResolvingCardRef = useRef(false);
    const sessionCreateRequestIdRef = useRef(0);

    const SILENCE_THRESHOLD_MS = 1500;
    const MIN_VOICE_BEFORE_STOP_ELIGIBLE_MS = 120;
    const BETWEEN_CARDS_DELAY_MS = 5000;

    useEffect(() => {
        currentCardIndexRef.current = currentCardIndex;
    }, [currentCardIndex]);

    useEffect(() => {
        flashcardsRef.current = flashcards;
    }, [flashcards]);

    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);

    useEffect(() => {
        isCooldownRef.current = isCooldown;
    }, [isCooldown]);

    const updateStatusWithDebounce = useCallback((message, type, delay = 120) => {
        if (statusUpdateTimeoutRef.current) {
            clearTimeout(statusUpdateTimeoutRef.current);
        }

        setStatusMessage(message);
        setStatusType(type);

        statusUpdateTimeoutRef.current = setTimeout(() => {
            statusUpdateTimeoutRef.current = null;
        }, delay);
    }, []);

    const getCurrentCard = useCallback(() => {
        return flashcardsRef.current[currentCardIndexRef.current];
    }, []);

    const getPromptLanguageId = useCallback(() => {
        return userDetails?.native_language || 'en';
    }, [userDetails]);

    const getLearnedLanguageLabel = useCallback(() => {
        const code = userDetails?.learned_language || '';
        const languageNames = {
            da: 'Danish',
            de: 'German',
            el: 'Greek',
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            hu: 'Hungarian',
            it: 'Italian',
            nl: 'Dutch',
            no: 'Norwegian',
            pl: 'Polish',
            pt: 'Portuguese',
            ro: 'Romanian',
            ru: 'Russian',
            sv: 'Swedish',
            tr: 'Turkish',
        };

        return languageNames[code] || code || 'the target language';
    }, [userDetails]);

    const resetCardUi = useCallback(() => {
        setShowResult(false);
        setAccuracyResult(null);
        setUserSpeech('');
    }, []);

    const updateScoreAndStreak = useCallback((accuracy) => {
        if (accuracy >= 70) {
            setTotalScore(prev => prev + accuracy);
            setCurrentStreak(prev => prev + 1);
        } else {
            setCurrentStreak(0);
        }
    }, []);

    const displayResults = useCallback((speech, analysis) => {
        setUserSpeech(speech);
        setAccuracyResult(analysis);
        setShowResult(true);
        updateScoreAndStreak(analysis.accuracy);

        setTimeout(() => {
            const resultSection = document.getElementById('resultSection');
            if (resultSection) {
                resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);
    }, [updateScoreAndStreak]);

    const getElapsedSessionSeconds = useCallback(() => {
        if (!pageSessionStartedAtRef.current) return 1;
        return Math.max(
            1,
            Math.round((Date.now() - pageSessionStartedAtRef.current) / 1000)
        );
    }, []);

    const startExerciseSession = useCallback(() => {
        pageSessionStartedAtRef.current = Date.now();
        sessionEndedRef.current = false;
        exerciseSessionIdRef.current = null;
        sessionCreateRequestIdRef.current += 1;
        const requestId = sessionCreateRequestIdRef.current;

        api.exerciseSessionCreate((sessionId) => {
            if (sessionCreateRequestIdRef.current === requestId) {
                exerciseSessionIdRef.current = sessionId;
            }
        });
    }, [api]);

    const endExerciseSessionIfNeeded = useCallback(() => {
        if (sessionEndedRef.current) return;

        const exerciseSessionId = exerciseSessionIdRef.current;
        if (exerciseSessionId) {
            api.exerciseSessionEnd(exerciseSessionId, getElapsedSessionSeconds());
        }
        sessionEndedRef.current = true;
    }, [api, getElapsedSessionSeconds]);

    const finishSessionAndGoToSummary = useCallback((nextCorrectBookmarks, nextIncorrectBookmarks, practicedCount) => {
        endExerciseSessionIfNeeded();
        history.push('/verbalFlashcards/summary', {
            isOutOfWordsToday: true,
            totalPracticedBookmarksInSession: practicedCount,
            correctBookmarks: nextCorrectBookmarks,
            incorrectBookmarks: nextIncorrectBookmarks,
            exerciseSessionTimer: getElapsedSessionSeconds(),
            source: 'verbal_flashcards',
        });
    }, [endExerciseSessionIfNeeded, getElapsedSessionSeconds, history]);

    const removeResolvedCard = useCallback((card, nextCorrectBookmarks, nextIncorrectBookmarks, practicedCount) => {
        setFlashcards((prev) => {
            const remaining = prev.filter((item) => item.id !== card.id);
            flashcardsRef.current = remaining;

            if (remaining.length === 0) {
                setCurrentCardIndex(0);
                currentCardIndexRef.current = 0;
                finishSessionAndGoToSummary(
                    nextCorrectBookmarks,
                    nextIncorrectBookmarks,
                    practicedCount
                );
                return remaining;
            }

            const currentIndex = currentCardIndexRef.current;
            const nextIndex = Math.min(currentIndex, remaining.length - 1);
            currentCardIndexRef.current = nextIndex;
            setCurrentCardIndex(nextIndex);
            return remaining;
        });
    }, [finishSessionAndGoToSummary]);

    const getSupportedMimeType = () => {
        const options = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
        ];

        for (const type of options) {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return '';
    };

    const loadFlashcards = useCallback((afterLoad = null) => {
        setLoading(true);
        setShowResult(false);

        api.getFlashcards(null, (data) => {
            console.log('Flashcards loaded:', data);
            const cards = data.flashcards || [];
            setFlashcards(cards);
            flashcardsRef.current = cards;
            attemptCountsRef.current = {};

            if (cards.length > 0) {
                setCurrentCardIndex(0);
                currentCardIndexRef.current = 0;
            }

            setLoading(false);

            if (afterLoad) {
                afterLoad(cards);
            }
        });
    }, [api]);

    const cleanupAudioResources = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            shouldProcessRecordingOnStopRef.current = false;
            try {
                mediaRecorderRef.current.stop();
            } catch (e) {
                console.warn(e);
            }
        }

        if (ttsAudioRef.current) {
            try {
                ttsAudioRef.current.pause();
                ttsAudioRef.current.currentTime = 0;
            } catch (e) {
                console.warn(e);
            }
            ttsAudioRef.current = null;
        }
        isPlayingTtsRef.current = false;

        mediaRecorderRef.current = null;

        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(track => track.stop());
            micStreamRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close().catch(console.warn);
            audioContextRef.current = null;
        }

        analyserRef.current = null;
        dataArrayRef.current = null;
        audioChunksRef.current = [];
        voiceStartedAtRef.current = 0;
        lastVoiceDetectedAtRef.current = 0;
        recordingStartedAtRef.current = 0;
        shouldProcessRecordingOnStopRef.current = false;
        isStartingRecordingRef.current = false;
        isRecordingRef.current = false;
        setIsRecording(false);
    }, []);

    const speakText = useCallback((textToSpeak, languageId, playbackStatusMessage = 'Playing TTS audio...') => {
        if (!textToSpeak) {
            updateStatusWithDebounce('No text available for TTS', 'error');
            return Promise.resolve();
        }

        if (ttsAudioRef.current) {
            try {
                ttsAudioRef.current.pause();
                ttsAudioRef.current.currentTime = 0;
            } catch (e) {
                console.warn(e);
            }
            ttsAudioRef.current = null;
        }

        isPlayingTtsRef.current = false;
        updateStatusWithDebounce('Requesting TTS audio...', 'processing', 0);

        return api.fetchLinkToSpeechMp3(textToSpeak, languageId)
            .then((audioUrl) => {
                if (!audioUrl) {
                    updateStatusWithDebounce('TTS returned no audio path', 'error', 0);
                    return;
                }

                return new Promise((resolve) => {
                    const audio = new Audio(audioUrl);
                    ttsAudioRef.current = audio;
                    isPlayingTtsRef.current = true;

                    audio.onended = () => {
                        isPlayingTtsRef.current = false;
                        updateStatusWithDebounce('TTS playback finished', 'idle', 0);
                        resolve();
                    };

                    audio.onerror = (err) => {
                        console.error('TTS audio error:', err);
                        isPlayingTtsRef.current = false;
                        updateStatusWithDebounce('TTS audio playback failed', 'error', 0);
                        resolve();
                    };

                    updateStatusWithDebounce(playbackStatusMessage, 'recording', 0);
                    audio.play().catch((err) => {
                        console.error('TTS playback start failed:', err);
                        isPlayingTtsRef.current = false;
                        updateStatusWithDebounce('TTS audio playback failed', 'error', 0);
                        resolve();
                    });
                });
            })
            .catch((err) => {
                console.error('TTS request failed:', err);
                isPlayingTtsRef.current = false;
                updateStatusWithDebounce('TTS request failed', 'error', 0);
            });
    }, [api, updateStatusWithDebounce]);

    const playCardTts = useCallback((card = null) => {
        const cardToSpeak = card || getCurrentCard();
        const promptText = cardToSpeak?.prompt || '';
        const learnedLanguageLabel = getLearnedLanguageLabel().toLowerCase();
        const textToSpeak = promptText
            ? `Please say '${promptText}' in ${learnedLanguageLabel}.`
            : '';
        const languageId = getPromptLanguageId();

        return speakText(textToSpeak, languageId);
    }, [getCurrentCard, getLearnedLanguageLabel, getPromptLanguageId, speakText]);

    const speakFeedback = useCallback((textToSpeak) => {
        const languageId = userDetails?.native_language || 'en';
        return speakText(textToSpeak, languageId, 'Playing feedback...');
    }, [speakText, userDetails]);

    const resolveCardAttempt = useCallback((card, userAnswer, isCorrect) => {
        if (!card) return;

        const nextCorrectBookmarks = isCorrect
            ? [...correctBookmarks, card]
            : correctBookmarks;
        const nextIncorrectBookmarks = isCorrect
            ? incorrectBookmarks
            : [...incorrectBookmarks, card];
        const practicedCount = totalPracticedBookmarksInSession + 1;
        const responseTime = recordingStartedAtRef.current
            ? Date.now() - recordingStartedAtRef.current
            : 0;
        const exerciseSessionId = exerciseSessionIdRef.current;

        if (exerciseSessionId && pageSessionStartedAtRef.current) {
            const elapsedSeconds = Math.max(
                1,
                Math.round((Date.now() - pageSessionStartedAtRef.current) / 1000)
            );
            api.exerciseSessionUpdate(exerciseSessionId, elapsedSeconds);
        }

        api.submitFlashcardAnswer(
            card.id,
            userAnswer,
            isCorrect,
            'speech',
            responseTime,
            exerciseSessionId,
            () => {
                setCorrectBookmarks(nextCorrectBookmarks);
                setIncorrectBookmarks(nextIncorrectBookmarks);
                setTotalPracticedBookmarksInSession(practicedCount);
                delete attemptCountsRef.current[card.id];

                const feedbackText = isCorrect
                    ? `Well done! The correct answer was '${card.answer}'.`
                    : `You almost got it, the correct answer was '${card.answer}'.`;

                isResolvingCardRef.current = true;
                speakFeedback(feedbackText).finally(() => {
                    interCardDelayTimeoutRef.current = setTimeout(() => {
                        interCardDelayTimeoutRef.current = null;
                        isResolvingCardRef.current = false;
                        removeResolvedCard(
                            card,
                            nextCorrectBookmarks,
                            nextIncorrectBookmarks,
                            practicedCount
                        );
                    }, BETWEEN_CARDS_DELAY_MS);
                });
            }
        );
    }, [
        api,
        correctBookmarks,
        incorrectBookmarks,
        removeResolvedCard,
        speakFeedback,
        totalPracticedBookmarksInSession,
    ]);

    const handleAttemptOutcome = useCallback((card, userAnswer, isCorrect) => {
        if (!card) return;

        const nextAttemptCount = (attemptCountsRef.current[card.id] || 0) + 1;
        attemptCountsRef.current[card.id] = nextAttemptCount;

        if (isCorrect) {
            resolveCardAttempt(card, userAnswer, true);
            return;
        }

        if (nextAttemptCount === 1) {
            speakFeedback('Almost there. Try again.').finally(() => {
                if (getCurrentCard()?.id === card.id) {
                    beginCardFlowRef.current();
                }
            });
            return;
        }

        resolveCardAttempt(card, userAnswer, false);
    }, [getCurrentCard, resolveCardAttempt, speakFeedback]);

    const stopRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;

        if (recorder && recorder.state === 'recording') {
            shouldProcessRecordingOnStopRef.current = true;
            try {
                recorder.stop();
            } catch (e) {
                console.warn(e);
            }
        }

        isRecordingRef.current = false;
        setIsRecording(false);
        isStartingRecordingRef.current = false;

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        updateStatusWithDebounce('Processing...', 'processing', 0);
    }, [updateStatusWithDebounce]);

    const handleRecordingStop = useCallback(() => {
        if (!shouldProcessRecordingOnStopRef.current) {
            cleanupAudioResources();
            updateStatusWithDebounce('Recording cancelled', 'idle', 0);
            return;
        }

        const currentCard = getCurrentCard();

        if (!currentCard) {
            updateStatusWithDebounce('Error: No flashcard loaded', 'error');
            cleanupAudioResources();
            return;
        }

        if (!audioChunksRef.current.length) {
            updateStatusWithDebounce('No audio detected', 'error');
            cleanupAudioResources();
            return;
        }

        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        updateStatusWithDebounce('Processing...', 'processing', 0);

        api.transcribeAudio(audioBlob, currentCard.id, (result) => {
            if (result?.error) {
                console.error('Transcription error:', result.error);
                updateStatusWithDebounce(`Error: ${result.error}`, 'error');
                cleanupAudioResources();
                return;
            }

            const transcription = result?.transcription || '';
            const expectedText = currentCard.expectedText || currentCard.prompt;

            api.checkPronunciation(transcription, expectedText, (analysis) => {
                if (analysis?.error) {
                    console.error('Pronunciation check error:', analysis.error);

                    const isCorrect = transcription.toLowerCase().includes(expectedText.toLowerCase());

                    displayResults(transcription, {
                        accuracy: isCorrect ? 100 : 0,
                        feedback: isCorrect ? 'Correct!' : 'Try again',
                        wordMatches: [],
                        detailedAnalysis: ''
                    });

                    cleanupAudioResources();
                    handleAttemptOutcome(currentCard, transcription, isCorrect);
                } else {
                    displayResults(transcription, analysis);
                    const isCorrect = (analysis?.accuracy || 0) >= 70;
                    cleanupAudioResources();
                    handleAttemptOutcome(currentCard, transcription, isCorrect);
                }

            });
        });
    }, [api, cleanupAudioResources, displayResults, getCurrentCard, handleAttemptOutcome, updateStatusWithDebounce]);

    const setupSilenceDetection = useCallback(() => {
        if (!micStreamRef.current) return;

        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.85;

            const source = audioContext.createMediaStreamSource(micStreamRef.current);
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            dataArrayRef.current = dataArray;

            const detect = () => {
                if (!isRecordingRef.current || !analyserRef.current || !dataArrayRef.current) {
                    return;
                }

                analyserRef.current.getByteTimeDomainData(dataArrayRef.current);

                let sumSquares = 0;
                let maxSample = 0;

                for (let i = 0; i < dataArrayRef.current.length; i++) {
                    const v = (dataArrayRef.current[i] - 128) / 128;
                    const abs = Math.abs(v);
                    if (abs > maxSample) maxSample = abs;
                    sumSquares += v * v;
                }

                const rms = Math.sqrt(sumSquares / dataArrayRef.current.length);
                const threshold = parseFloat(noiseSensitivity);
                const isVoiceFrame = maxSample > threshold || rms > threshold;
                const now = Date.now();

                if (isVoiceFrame) {
                    lastVoiceDetectedAtRef.current = now;

                    if (!voiceStartedAtRef.current) {
                        voiceStartedAtRef.current = now;
                    }

                    updateStatusWithDebounce('🔴 Recording... Speak now', 'recording', 0);
                } else {
                    const voicedFor =
                        voiceStartedAtRef.current > 0
                            ? now - voiceStartedAtRef.current
                            : 0;

                    const silenceDuration =
                        lastVoiceDetectedAtRef.current > 0
                            ? now - lastVoiceDetectedAtRef.current
                            : now - recordingStartedAtRef.current;

                    if (voicedFor >= MIN_VOICE_BEFORE_STOP_ELIGIBLE_MS && silenceDuration >= SILENCE_THRESHOLD_MS) {
                        stopRecording();
                        return;
                    }

                    updateStatusWithDebounce(
                        '⏸️ Waiting for speech / silence...',
                        'processing',
                        0
                    );
                }

                animationFrameRef.current = requestAnimationFrame(detect);
            };

            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(console.warn);
            }

            detect();
        } catch (error) {
            console.error('Silence detection setup error:', error);
            updateStatusWithDebounce('Mic analysis error', 'error');
        }
    }, [noiseSensitivity, stopRecording, updateStatusWithDebounce]);

    const openMicAndStartRecording = useCallback(async () => {
        if (isStartingRecordingRef.current || isRecordingRef.current) return;
        if (isCooldownRef.current) return;

        try {
            isStartingRecordingRef.current = true;

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });

            if (isCooldownRef.current) {
                stream.getTracks().forEach(track => track.stop());
                isStartingRecordingRef.current = false;
                return;
            }

            micStreamRef.current = stream;

            const mimeType = getSupportedMimeType();
            mediaRecorderRef.current = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);

            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = handleRecordingStop;
            shouldProcessRecordingOnStopRef.current = true;

            recordingStartedAtRef.current = Date.now();
            lastVoiceDetectedAtRef.current = Date.now();
            voiceStartedAtRef.current = 0;

            mediaRecorderRef.current.start();

            isRecordingRef.current = true;
            setIsRecording(true);
            isStartingRecordingRef.current = false;

            setShowResult(false);
            setAccuracyResult(null);

            updateStatusWithDebounce('🔴 Recording... Speak now', 'recording', 0);
            setupSilenceDetection();
        } catch (error) {
            console.error('Recording start error:', error);
            isStartingRecordingRef.current = false;
            isRecordingRef.current = false;
            setIsRecording(false);
            updateStatusWithDebounce('Microphone permission needed', 'error');
            cleanupAudioResources();
        }
    }, [cleanupAudioResources, handleRecordingStop, setupSilenceDetection, updateStatusWithDebounce]);

    const cancelCountdown = useCallback(() => {
        if (cooldownTimeoutRef.current) {
            clearTimeout(cooldownTimeoutRef.current);
            cooldownTimeoutRef.current = null;
        }

        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }

        if (interCardDelayTimeoutRef.current) {
            clearTimeout(interCardDelayTimeoutRef.current);
            interCardDelayTimeoutRef.current = null;
        }

        isResolvingCardRef.current = false;

        setIsCooldown(false);
        isCooldownRef.current = false;
    }, []);

    const stopCurrentFlow = useCallback(() => {
        flowRunIdRef.current += 1;
        cancelCountdown();

        if (
            isRecordingRef.current
            || isStartingRecordingRef.current
            || micStreamRef.current
            || ttsAudioRef.current
        ) {
            cleanupAudioResources();
        }
    }, [cancelCountdown, cleanupAudioResources]);

    const beginCardFlow = useCallback(() => {
        if (flashcardsRef.current.length === 0) return;
        if (isResolvingCardRef.current) return;

        stopCurrentFlow();
        resetCardUi();

        const card = flashcardsRef.current[currentCardIndexRef.current];
        setIsCooldown(true);
        isCooldownRef.current = true;
        updateStatusWithDebounce('Listen carefully...', 'cooldown', 0);

        const flowRunId = flowRunIdRef.current;

        if (!card) {
            setIsCooldown(false);
            isCooldownRef.current = false;
            return;
        }

        playCardTts(card).finally(async () => {
            if (flowRunId !== flowRunIdRef.current) {
                return;
            }

            cooldownTimeoutRef.current = null;
            setIsCooldown(false);
            isCooldownRef.current = false;
            updateStatusWithDebounce('Starting microphone...', 'processing', 0);

            await openMicAndStartRecording();
        });
    }, [openMicAndStartRecording, playCardTts, resetCardUi, stopCurrentFlow, updateStatusWithDebounce]);

    useEffect(() => {
        beginCardFlowRef.current = beginCardFlow;
    }, [beginCardFlow]);

    const nextCard = useCallback(() => {
        if (currentCardIndexRef.current < flashcardsRef.current.length - 1) {
            stopCurrentFlow();
            const nextIndex = currentCardIndexRef.current + 1;
            currentCardIndexRef.current = nextIndex;
            setCurrentCardIndex(nextIndex);
        }
    }, [stopCurrentFlow]);

    const prevCard = useCallback(() => {
        if (currentCardIndexRef.current > 0) {
            stopCurrentFlow();
            const prevIndex = currentCardIndexRef.current - 1;
            currentCardIndexRef.current = prevIndex;
            setCurrentCardIndex(prevIndex);
        }
    }, [stopCurrentFlow]);

    const shuffleCards = useCallback(() => {
        stopCurrentFlow();
        const shuffled = [...flashcardsRef.current].sort(() => Math.random() - 0.5);
        setFlashcards(shuffled);
        flashcardsRef.current = shuffled;
        setCurrentCardIndex(0);
        currentCardIndexRef.current = 0;
    }, [stopCurrentFlow]);

    const repeatCard = useCallback(() => {
        beginCardFlow();
    }, [beginCardFlow]);

    const reseedFlashcards = useCallback(() => {
        if (isReseeding) return;

        stopCurrentFlow();
        setIsReseeding(true);
        setLoading(true);
        resetCardUi();
        setCorrectBookmarks([]);
        setIncorrectBookmarks([]);
        setTotalPracticedBookmarksInSession(0);
        setTotalScore(0);
        setCurrentStreak(0);
        setStatusMessage('Adding fresh Danish test words...');
        setStatusType('processing');

        endExerciseSessionIfNeeded();
        exerciseSessionIdRef.current = null;
        startExerciseSession();

        api.reseedFlashcards(20, (result) => {
            if (result?.error) {
                setIsReseeding(false);
                setLoading(false);
                updateStatusWithDebounce(`Reseed failed: ${result.error}`, 'error', 0);
                return;
            }

            const seededCount = result?.seeded_count || 0;
            const refreshedCount = result?.refreshed_count || 0;

            loadFlashcards((cards) => {
                setIsReseeding(false);

                if (cards.length > 0) {
                    updateStatusWithDebounce(
                        `Ready with ${cards.length} flashcards (${seededCount} new, ${refreshedCount} refreshed).`,
                        'idle',
                        0
                    );
                } else {
                    updateStatusWithDebounce(
                        `Added words (${seededCount} new, ${refreshedCount} refreshed), but no flashcards are available yet.`,
                        'warning',
                        0
                    );
                }
            });
        });
    }, [
        api,
        endExerciseSessionIfNeeded,
        isReseeding,
        loadFlashcards,
        resetCardUi,
        startExerciseSession,
        stopCurrentFlow,
        updateStatusWithDebounce,
    ]);

    useEffect(() => {
        loadFlashcards();
    }, [loadFlashcards]);

    useEffect(() => {
        startExerciseSession();

        return () => {
            endExerciseSessionIfNeeded();
        };
    }, [endExerciseSessionIfNeeded, startExerciseSession]);

    useEffect(() => {
        if (loading) return;
        if (flashcards.length === 0) return;

        beginCardFlow();
    }, [currentCardIndex, flashcards, loading, beginCardFlow]);

    useEffect(() => {
        return () => {
            cancelCountdown();

            if (statusUpdateTimeoutRef.current) {
                clearTimeout(statusUpdateTimeoutRef.current);
            }

            cleanupAudioResources();
        };
    }, [cancelCountdown, cleanupAudioResources]);

    const currentCard = flashcards[currentCardIndex];

    const renderWordBreakdown = (wordMatches) => {
        if (!wordMatches || wordMatches.length === 0) return null;

        return (
            <s.WordBreakdown>
                <h5>Word breakdown:</h5>
                <s.WordList>
                    {wordMatches.map((match, idx) => (
                        <s.WordItem
                            key={idx}
                            $isCorrect={match.isCorrect}
                            $isInPosition={match.isInPosition}
                        >
                            <s.WordText>{match.word}</s.WordText>
                            <s.WordPosition>{match.position + 1}</s.WordPosition>
                            <s.WordStatus>
                                {match.isCorrect ? (match.isInPosition ? '✓✓' : '✓✗') : '✗'}
                            </s.WordStatus>
                            {match.suggestedWord && !match.isCorrect && (
                                <s.WordSuggestion>→ {match.suggestedWord}</s.WordSuggestion>
                            )}
                        </s.WordItem>
                    ))}
                </s.WordList>
            </s.WordBreakdown>
        );
    };

    return (
        <s.FlashcardsContainer>
            <s.HeaderSection>
                <s.TitleSection>
                    <s.TitleContainer>
                        <h2>Verbal Flashcards</h2>
                    </s.TitleContainer>
                    <s.FiltersContainer>
                        <s.FilterSelect
                            value={noiseSensitivity}
                            onChange={(e) => setNoiseSensitivity(e.target.value)}
                        >
                            <option value="0.03">Low Noise (Indoor)</option>
                            <option value="0.08">Medium Noise (Outdoor)</option>
                            <option value="0.11">High Noise (Street)</option>
                        </s.FilterSelect>
                        <s.HeaderButton
                            onClick={reseedFlashcards}
                            disabled={loading || isReseeding}
                        >
                            {isReseeding ? 'Reseeding…' : 'Reseed 20 Danish Words'}
                        </s.HeaderButton>
                    </s.FiltersContainer>
                </s.TitleSection>

                <s.StatsContainer>
                    <s.StatItem>
                        <s.StatLabel>Progress:</s.StatLabel>
                        <s.StatValue>
                            {`${flashcards.length > 0 ? currentCardIndex + 1 : 0}/${flashcards.length}`}
                        </s.StatValue>
                    </s.StatItem>
                    <s.StatItem>
                        <s.StatLabel>Score:</s.StatLabel>
                        <s.StatValue>{Math.round(totalScore)}</s.StatValue>
                    </s.StatItem>
                    <s.StatItem>
                        <s.StatLabel>Streak:</s.StatLabel>
                        <s.StatValue $isStreak={currentStreak > 0}>
                            {currentStreak}
                        </s.StatValue>
                    </s.StatItem>
                </s.StatsContainer>
            </s.HeaderSection>

            <s.Flashcard>
                <s.CardContent>
                    {loading ? (
                        <s.LoadingState>
                            <s.Spinner />
                            <p>Loading flashcards...</p>
                        </s.LoadingState>
                    ) : flashcards.length === 0 ? (
                        <s.NoCardsMessage>
                            <p>No flashcards available.</p>
                        </s.NoCardsMessage>
                    ) : currentCard && (
                        <>
                            <s.PromptSection>
                                <s.PromptLabel>Say this:</s.PromptLabel>
                                <s.PromptText>{currentCard.prompt}</s.PromptText>
                            </s.PromptSection>

                            <s.RecordingSection>
                                <s.StatusMessage $statusType={statusType}>
                                    {statusMessage}
                                </s.StatusMessage>

                                {isRecording && (
                                    <s.RecordingVisualization>
                                        <s.SoundWave>
                                            <span></span><span></span><span></span><span></span><span></span>
                                        </s.SoundWave>
                                    </s.RecordingVisualization>
                                )}
                            </s.RecordingSection>

                            {showResult && accuracyResult && (
                                <s.ResultSection id="resultSection">
                                    <h4>Your attempt:</h4>
                                    <s.UserSpeech>{userSpeech || 'No speech detected'}</s.UserSpeech>

                                    <s.FeedbackContainer>
                                        <s.AccuracyMeter>
                                            <s.AccuracyLabel>Accuracy:</s.AccuracyLabel>
                                            <s.ProgressBar>
                                                <s.ProgressFill
                                                    $accuracy={accuracyResult.accuracy}
                                                    style={{ width: `${accuracyResult.accuracy}%` }}
                                                />
                                            </s.ProgressBar>
                                            <s.AccuracyPercentage>
                                                {accuracyResult.accuracy}%
                                            </s.AccuracyPercentage>
                                        </s.AccuracyMeter>

                                        <s.FeedbackMessage
                                            $feedbackType={
                                                accuracyResult.accuracy >= 70
                                                    ? 'success'
                                                    : accuracyResult.accuracy >= 40
                                                        ? 'warning'
                                                        : 'error'
                                            }
                                        >
                                            {accuracyResult.feedback}
                                        </s.FeedbackMessage>

                                        {accuracyResult.detailedAnalysis && (
                                            <s.DetailedAnalysis>
                                                {accuracyResult.detailedAnalysis}
                                            </s.DetailedAnalysis>
                                        )}
                                    </s.FeedbackContainer>

                                    {renderWordBreakdown(accuracyResult.wordMatches)}
                                </s.ResultSection>
                            )}

                            <s.ActionButtons>
                                <s.NavigationButtons>
                                    <s.NavButton
                                        onClick={prevCard}
                                        disabled={currentCardIndex === 0}
                                    >
                                        ← Previous
                                    </s.NavButton>
                                    <s.NavButton
                                        onClick={nextCard}
                                        disabled={currentCardIndex === flashcards.length - 1}
                                    >
                                        Next →
                                    </s.NavButton>
                                </s.NavigationButtons>

                                <s.UtilityButtons>
                                    <s.UtilityButton onClick={shuffleCards} title="Shuffle cards">
                                        🔄
                                    </s.UtilityButton>
                                    <s.UtilityButton onClick={repeatCard} title="Repeat this card">
                                        🔁
                                    </s.UtilityButton>
                                </s.UtilityButtons>
                            </s.ActionButtons>
                        </>
                    )}
                </s.CardContent>
            </s.Flashcard>
        </s.FlashcardsContainer>
    );
}

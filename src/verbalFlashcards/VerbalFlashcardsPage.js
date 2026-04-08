import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { APIContext } from '../contexts/APIContext';
import { UserContext } from '../contexts/UserContext';
import * as s from './verbalFlashcards_Styled/VerbalFlashcards.sc.js';

export default function VerbalFlashcardsPage() {
    const api = useContext(APIContext);
    const { userDetails } = useContext(UserContext);

    // State
    const [flashcards, setFlashcards] = useState([]);
    const [filteredFlashcards, setFilteredFlashcards] = useState([]);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [totalScore, setTotalScore] = useState(0);
    const [currentStreak, setCurrentStreak] = useState(0);
    const [showHint, setShowHint] = useState(false);
    const [showResult, setShowResult] = useState(false);
    const [userSpeech, setUserSpeech] = useState('');
    const [accuracyResult, setAccuracyResult] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isCooldown, setIsCooldown] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Loading...');
    const [statusType, setStatusType] = useState('idle');
    const [noiseSensitivity, setNoiseSensitivity] = useState('0.08');

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

    const currentCardIndexRef = useRef(0);
    const filteredFlashcardsRef = useRef([]);
    const isRecordingRef = useRef(false);
    const isCooldownRef = useRef(false);
    const isStartingRecordingRef = useRef(false);

    const lastVoiceDetectedAtRef = useRef(0);
    const voiceStartedAtRef = useRef(0);
    const recordingStartedAtRef = useRef(0);

    const SILENCE_THRESHOLD_MS = 1500;
    const MIN_VOICE_BEFORE_STOP_ELIGIBLE_MS = 120;
    const COOLDOWN_SECONDS = 5;

    useEffect(() => {
        currentCardIndexRef.current = currentCardIndex;
    }, [currentCardIndex]);

    useEffect(() => {
        filteredFlashcardsRef.current = filteredFlashcards;
    }, [filteredFlashcards]);

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
        return filteredFlashcardsRef.current[currentCardIndexRef.current];
    }, []);

    const resetCardUi = useCallback(() => {
        setShowHint(false);
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

    const submitAnswer = useCallback((userAnswer, isCorrect) => {
        const currentCard = getCurrentCard();
        if (!currentCard) return;

        const responseTime = recordingStartedAtRef.current
            ? Date.now() - recordingStartedAtRef.current
            : 0;

        api.submitFlashcardAnswer(
            currentCard.id,
            userAnswer,
            isCorrect,
            'speech',
            responseTime,
            (result) => {
                console.log('Answer submitted:', result);
            }
        );
    }, [api, getCurrentCard]);

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

    const loadFlashcards = useCallback(() => {
        setLoading(true);
        setShowResult(false);

        api.getFlashcards(null, (data) => {
            console.log('Flashcards loaded:', data);
            const cards = data.flashcards || [];
            setFlashcards(cards);
            setFilteredFlashcards(cards);
            filteredFlashcardsRef.current = cards;

            if (cards.length > 0) {
                setCurrentCardIndex(0);
                currentCardIndexRef.current = 0;
            }

            setLoading(false);
        });
    }, [api]);

    const cleanupAudioResources = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            try {
                mediaRecorderRef.current.stop();
            } catch (e) {
                console.warn(e);
            }
        }

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
        isStartingRecordingRef.current = false;
        isRecordingRef.current = false;
        setIsRecording(false);
    }, []);

    const stopRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;

        if (recorder && recorder.state === 'recording') {
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

                    submitAnswer(transcription, isCorrect);
                } else {
                    displayResults(transcription, analysis);
                    const isCorrect = (analysis?.accuracy || 0) >= 70;
                    submitAnswer(transcription, isCorrect);
                }

                updateStatusWithDebounce('Result ready', 'idle');
                cleanupAudioResources();
            });
        });
    }, [api, cleanupAudioResources, displayResults, getCurrentCard, submitAnswer, updateStatusWithDebounce]);

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
                        `⏸️ Waiting for speech / silence...`,
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

        setIsCooldown(false);
        isCooldownRef.current = false;
    }, []);

    const stopCurrentFlow = useCallback(() => {
        cancelCountdown();

        if (isRecordingRef.current || isStartingRecordingRef.current || micStreamRef.current) {
            cleanupAudioResources();
        }
    }, [cancelCountdown, cleanupAudioResources]);

    const beginCardFlow = useCallback(() => {
        if (filteredFlashcardsRef.current.length === 0) return;

        stopCurrentFlow();
        resetCardUi();

        let cooldownSeconds = COOLDOWN_SECONDS;
        setIsCooldown(true);
        isCooldownRef.current = true;
        updateStatusWithDebounce(`Get ready... Starting in ${cooldownSeconds}s`, 'cooldown', 0);

        countdownIntervalRef.current = setInterval(() => {
            cooldownSeconds -= 1;

            if (cooldownSeconds > 0) {
                updateStatusWithDebounce(`Get ready... Starting in ${cooldownSeconds}s`, 'cooldown', 0);
            } else {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
            }
        }, 1000);

        cooldownTimeoutRef.current = setTimeout(async () => {
            cooldownTimeoutRef.current = null;
            setIsCooldown(false);
            isCooldownRef.current = false;

            await openMicAndStartRecording();
        }, COOLDOWN_SECONDS * 1000);
    }, [openMicAndStartRecording, resetCardUi, stopCurrentFlow, updateStatusWithDebounce]);

    const clearFilters = useCallback(() => {
        setFilteredFlashcards(flashcards);
        filteredFlashcardsRef.current = flashcards;
        setCurrentCardIndex(0);
        currentCardIndexRef.current = 0;
        resetCardUi();
    }, [flashcards, resetCardUi]);

    const nextCard = useCallback(() => {
        if (currentCardIndexRef.current < filteredFlashcardsRef.current.length - 1) {
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
        const shuffled = [...filteredFlashcardsRef.current].sort(() => Math.random() - 0.5);
        setFilteredFlashcards(shuffled);
        filteredFlashcardsRef.current = shuffled;
        setCurrentCardIndex(0);
        currentCardIndexRef.current = 0;
    }, [stopCurrentFlow]);

    const repeatCard = useCallback(() => {
        beginCardFlow();
    }, [beginCardFlow]);

    useEffect(() => {
        loadFlashcards();
    }, [loadFlashcards]);

    useEffect(() => {
        if (loading) return;
        if (filteredFlashcards.length === 0) return;

        beginCardFlow();
    }, [currentCardIndex, filteredFlashcards, loading, beginCardFlow]);

    useEffect(() => {
        return () => {
            cancelCountdown();

            if (statusUpdateTimeoutRef.current) {
                clearTimeout(statusUpdateTimeoutRef.current);
            }

            cleanupAudioResources();
        };
    }, [cancelCountdown, cleanupAudioResources]);

    const currentCard = filteredFlashcards[currentCardIndex];

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
                    </s.FiltersContainer>
                </s.TitleSection>

                <s.StatsContainer>
                    <s.StatItem>
                        <s.StatLabel>Progress:</s.StatLabel>
                        <s.StatValue>
                            {filteredFlashcards.length > 0 ? currentCardIndex + 1 : 0}/{filteredFlashcards.length}
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
                    ) : filteredFlashcards.length === 0 ? (
                        <s.NoCardsMessage>
                            <p>😕 No flashcards match your filters</p>
                            <s.FilterButton onClick={clearFilters}>Clear Filters</s.FilterButton>
                        </s.NoCardsMessage>
                    ) : currentCard && (
                        <>
                            <s.PromptSection>
                                <s.PromptLabel>Say this:</s.PromptLabel>
                                <s.PromptText>{currentCard.prompt}</s.PromptText>
                                {currentCard.phoneticHint && (
                                    <s.PhoneticHint>{currentCard.phoneticHint}</s.PhoneticHint>
                                )}
                            </s.PromptSection>

                            <s.HintSection>
                                <s.HintToggle onClick={() => setShowHint(!showHint)}>
                                    <span className="hint-icon">💡</span>
                                    <span>{showHint ? 'Hide Hint' : 'Show Hint'}</span>
                                </s.HintToggle>

                                {showHint && (
                                    <s.HintContent>
                                        <s.HintBox>
                                            <p>{currentCard.hint || 'No hint available'}</p>
                                            {currentCard.example && (
                                                <s.ExampleSentence>{currentCard.example}</s.ExampleSentence>
                                            )}
                                        </s.HintBox>
                                    </s.HintContent>
                                )}
                            </s.HintSection>

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
                                        disabled={currentCardIndex === filteredFlashcards.length - 1}
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
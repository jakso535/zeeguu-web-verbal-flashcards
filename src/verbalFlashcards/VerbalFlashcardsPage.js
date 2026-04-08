import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { APIContext } from '../contexts/APIContext';
import { UserContext } from '../contexts/UserContext';
import * as s from './verbalFlashcards_Styled/VerbalFlashcards.sc.js';


export default function VerbalFlashcardsPage() {
   const api = useContext(APIContext);
   const { userDetails } = useContext(UserContext);


   // State management
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
   const [statusMessage, setStatusMessage] = useState('Ready to record');
   const [statusType, setStatusType] = useState('idle');
   const [noiseSensitivity, setNoiseSensitivity] = useState('0.08');


   // Refs
   const mediaRecorderRef = useRef(null);
   const audioChunksRef = useRef([]);
   const silenceTimerRef = useRef(null);
   const cooldownTimeoutRef = useRef(null);
   const audioContextRef = useRef(null);
   const analyserRef = useRef(null);
   const animationFrameRef = useRef(null);
   const statusUpdateTimeoutRef = useRef(null);


   const SILENCE_THRESHOLD_MS = 1500;
   const COOLDOWN_SECONDS = 5;


   // Helper functions
   const updateStatusWithDebounce = useCallback((message, type, delay = 200) => {
       if (statusUpdateTimeoutRef.current) {
           clearTimeout(statusUpdateTimeoutRef.current);
       }
       setStatusMessage(message);
       setStatusType(type);
       statusUpdateTimeoutRef.current = setTimeout(() => {
           statusUpdateTimeoutRef.current = null;
       }, delay);
   }, []);


   // Load flashcards
   const loadFlashcards = useCallback(async () => {
       setLoading(true);
       setShowResult(false);


       api.getFlashcards(null, (data) => {
           console.log('Flashcards loaded:', data);
           const cards = data.flashcards || [];
           setFlashcards(cards);
           setFilteredFlashcards(cards);
           if (cards.length > 0) {
               setCurrentCardIndex(0);
           }
           setLoading(false);
       });
   }, [api]);


   // Update current card display
   const updateCard = useCallback(() => {
       if (filteredFlashcards.length === 0) return;


       setShowHint(false);
       setShowResult(false);
       setAccuracyResult(null);
       setUserSpeech('');


       // Stop any ongoing recording
       if (isRecording) {
           stopRecording();
       }


       setStatusMessage('Ready to record');
       setStatusType('idle');
   }, [filteredFlashcards.length, isRecording]);


   // Navigation
   const nextCard = useCallback(() => {
       if (currentCardIndex < filteredFlashcards.length - 1) {
           setCurrentCardIndex(currentCardIndex + 1);
           updateCard();
       }
   }, [currentCardIndex, filteredFlashcards.length, updateCard]);


   const prevCard = useCallback(() => {
       if (currentCardIndex > 0) {
           setCurrentCardIndex(currentCardIndex - 1);
           updateCard();
       }
   }, [currentCardIndex, updateCard]);


   const shuffleCards = useCallback(() => {
       const shuffled = [...filteredFlashcards].sort(() => Math.random() - 0.5);
       setFilteredFlashcards(shuffled);
       setCurrentCardIndex(0);
       updateCard();
   }, [filteredFlashcards, updateCard]);


   const repeatCard = useCallback(() => {
       updateCard();
   }, [updateCard]);


   // Update score and streak
   const updateScoreAndStreak = useCallback((accuracy) => {
       if (accuracy >= 70) {
           setTotalScore(prev => prev + accuracy);
           setCurrentStreak(prev => prev + 1);
       } else {
           setCurrentStreak(0);
       }
   }, []);


   // Display results
   const displayResults = useCallback((speech, analysis) => {
       setUserSpeech(speech);
       setAccuracyResult(analysis);
       setShowResult(true);
       updateScoreAndStreak(analysis.accuracy);


       // Scroll to results
       setTimeout(() => {
           const resultSection = document.getElementById('resultSection');
           if (resultSection) {
               resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
           }
       }, 100);
   }, [updateScoreAndStreak]);


   // Submit answer to backend
   const submitAnswer = useCallback((userAnswer, isCorrect, accuracyAnalysis) => {
       const currentCard = filteredFlashcards[currentCardIndex];
       if (!currentCard) return;


       api.submitFlashcardAnswer(
           currentCard.id,
           userAnswer,
           isCorrect,
           'speech',
           5000,
           (result) => {
               console.log('Answer submitted:', result);
           }
       );
   }, [api, filteredFlashcards, currentCardIndex]);


   // Handle recording stop and process audio
   const handleRecordingStop = useCallback(async () => {
       setStatusMessage('Processing...');
       setStatusType('processing');


       const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
       const currentCard = filteredFlashcards[currentCardIndex];


       if (!currentCard) {
           setStatusMessage('Error: No flashcard loaded');
           setStatusType('error');
           return;
       }


       api.transcribeAudio(audioBlob, currentCard.id, (result) => {
           if (result.error) {
               console.error('Transcription error:', result.error);
               setStatusMessage(`Error: ${result.error}`);
               setStatusType('error');
               return;
           }


           const transcription = result.transcription || '';
           const expectedText = currentCard.expectedText || currentCard.prompt;


           // Check pronunciation
           api.checkPronunciation(transcription, expectedText, (analysis) => {
               if (analysis.error) {
                   console.error('Pronunciation check error:', analysis.error);
                   // Fallback to simple check
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
                   const isCorrect = analysis.accuracy >= 70;
                   submitAnswer(transcription, isCorrect, analysis);
               }


               setStatusMessage('Ready to record');
               setStatusType('idle');
           });
       });
   }, [api, filteredFlashcards, currentCardIndex, displayResults, submitAnswer]);


   // Stop recording
   const stopRecording = useCallback(() => {
       if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
           mediaRecorderRef.current.stop();
           setIsRecording(false);


           // Stop all tracks
           if (mediaRecorderRef.current.stream) {
               mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
           }


           // Clean up audio context
           if (audioContextRef.current) {
               audioContextRef.current.close().catch(console.warn);
               audioContextRef.current = null;
           }


           // Clear silence timer
           if (silenceTimerRef.current) {
               clearTimeout(silenceTimerRef.current);
               silenceTimerRef.current = null;
           }


           setStatusMessage('Processing...');
           setStatusType('processing');
       }
   }, []);


   // Setup voice activity detection
   const setupVAD = useCallback((stream) => {
       try {
           const audioContext = new (window.AudioContext || window.webkitAudioContext)();
           const source = audioContext.createMediaStreamSource(stream);
           const analyser = audioContext.createAnalyser();
           source.connect(analyser);
           analyser.fftSize = 256;
           const dataArray = new Uint8Array(analyser.frequencyBinCount);


           audioContext.resume().catch(console.warn);


           audioContextRef.current = audioContext;
           analyserRef.current = analyser;


           let speechActive = false;
           let speechStartTime = null;
           let silenceStart = null;
           let frameCount = 0;


           const detectSpeech = () => {
               if (!isRecording) {
                   if (animationFrameRef.current) {
                       cancelAnimationFrame(animationFrameRef.current);
                   }
                   return;
               }


               frameCount++;


               try {
                   analyser.getByteTimeDomainData(dataArray);


                   let maxSample = 0;
                   for (let i = 0; i < dataArray.length; i++) {
                       const v = (dataArray[i] - 128) / 128;
                       maxSample = Math.max(maxSample, Math.abs(v));
                   }


                   const threshold = parseFloat(noiseSensitivity);


                   if (maxSample > threshold) {
                       if (!speechActive) {
                           speechStartTime = Date.now();
                           speechActive = true;
                           if (silenceTimerRef.current) {
                               clearTimeout(silenceTimerRef.current);
                               silenceTimerRef.current = null;
                           }
                           updateStatusWithDebounce('Speaking...', 'recording', 100);
                       }
                   } else if (speechActive && !silenceTimerRef.current) {
                       const speechDuration = Date.now() - speechStartTime;
                       if (speechDuration >= 150) {
                           speechActive = false;
                           silenceStart = Date.now();
                           silenceTimerRef.current = setTimeout(() => {
                               if (isRecording && !speechActive) {
                                   stopRecording();
                               }
                               silenceTimerRef.current = null;
                           }, SILENCE_THRESHOLD_MS);
                           updateStatusWithDebounce('Silence detected, stopping...', 'processing', 100);
                       } else {
                           speechActive = false;
                       }
                   }
               } catch (error) {
                   console.error('Error in speech detection:', error);
               }


               animationFrameRef.current = requestAnimationFrame(detectSpeech);
           };


           detectSpeech();
           return true;
       } catch (error) {
           console.error('Error setting up VAD:', error);
           return false;
       }
   }, [isRecording, noiseSensitivity, stopRecording, updateStatusWithDebounce]);


   // Start recording with cooldown
   const startRecording = useCallback(async () => {
       if (isCooldown) return;


       try {
           setIsCooldown(true);
           let cooldownSeconds = COOLDOWN_SECONDS;
           setStatusMessage(`Get ready... Starting in ${cooldownSeconds}s`);
           setStatusType('cooldown');


           const countdownInterval = setInterval(() => {
               cooldownSeconds--;
               if (cooldownSeconds > 0) {
                   setStatusMessage(`Get ready... Starting in ${cooldownSeconds}s`);
               } else {
                   clearInterval(countdownInterval);
               }
           }, 1000);


           cooldownTimeoutRef.current = setTimeout(async () => {
               try {
                   const stream = await navigator.mediaDevices.getUserMedia({ audio: true });


                   mediaRecorderRef.current = new MediaRecorder(stream);
                   audioChunksRef.current = [];


                   mediaRecorderRef.current.ondataavailable = (event) => {
                       if (event.data.size > 0) {
                           audioChunksRef.current.push(event.data);
                       }
                   };


                   mediaRecorderRef.current.onstop = handleRecordingStop;


                   setIsRecording(true);
                   setIsCooldown(false);


                   setupVAD(stream);
                   mediaRecorderRef.current.start();


                   setStatusMessage('Recording... Speak now');
                   setStatusType('recording');
               } catch (error) {
                   console.error('Recording error:', error);
                   setStatusMessage('Microphone access denied');
                   setStatusType('error');
                   setIsRecording(false);
                   setIsCooldown(false);
               }
           }, COOLDOWN_SECONDS * 1000);
       } catch (error) {
           console.error('Cooldown error:', error);
           setIsCooldown(false);
       }
   }, [isCooldown, setupVAD, handleRecordingStop]);


   const toggleRecording = useCallback(() => {
       if (!isRecording && !isCooldown) {
           startRecording();
       } else if (isRecording) {
           stopRecording();
       }
   }, [isRecording, isCooldown, startRecording, stopRecording]);


   // Clean up on unmount
   useEffect(() => {
       return () => {
           if (animationFrameRef.current) {
               cancelAnimationFrame(animationFrameRef.current);
           }
           if (cooldownTimeoutRef.current) {
               clearTimeout(cooldownTimeoutRef.current);
           }
           if (silenceTimerRef.current) {
               clearTimeout(silenceTimerRef.current);
           }
           if (statusUpdateTimeoutRef.current) {
               clearTimeout(statusUpdateTimeoutRef.current);
           }
           if (audioContextRef.current) {
               audioContextRef.current.close().catch(console.warn);
           }
       };
   }, []);


   // Initial load
   useEffect(() => {
       loadFlashcards();
   }, [loadFlashcards]);


   const currentCard = filteredFlashcards[currentCardIndex];


   // Helper function to render word breakdown
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
           {/* Header with stats and filters */}
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
                           {currentCardIndex + 1}/{filteredFlashcards.length}
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


           {/* Main flashcard */}
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
                           {/* Prompt section */}
                           <s.PromptSection>
                               <s.PromptLabel>Say this:</s.PromptLabel>
                               <s.PromptText>{currentCard.prompt}</s.PromptText>
                               {currentCard.phoneticHint && (
                                   <s.PhoneticHint>{currentCard.phoneticHint}</s.PhoneticHint>
                               )}
                           </s.PromptSection>


                           {/* Hint section */}
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


                           {/* Recording section */}
                           <s.RecordingSection>
                               <s.RecordButton
                                   onClick={toggleRecording}
                                   disabled={isCooldown}
                               >
                                   <span className="record-icon">🎤</span>
                                   <span>
                                       {isRecording ? 'Stop Recording' :
                                           isCooldown ? 'Get ready...' : 'Start Recording'}
                                   </span>
                               </s.RecordButton>
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


                           {/* Result section */}
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
                                               accuracyResult.accuracy >= 70 ? 'success' :
                                                   accuracyResult.accuracy >= 40 ? 'warning' : 'error'
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


                           {/* Navigation buttons */}
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

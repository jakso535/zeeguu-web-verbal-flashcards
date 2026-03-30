import React, { useContext, useEffect, useState } from 'react';
import { NarrowColumn } from '../components/ColumnWidth.sc';
import { APIContext } from '../contexts/APIContext';
import { UserContext } from '../contexts/UserContext';

export default function VerbalFlashcardsPage() {
    const api = useContext(APIContext);
    const { userDetails } = useContext(UserContext);
    const [flashcards, setFlashcards] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [transcription, setTranscription] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const [audioChunks, setAudioChunks] = useState([]);

    useEffect(() => {
        // Test the API endpoints
        testAPI();
    }, []);

    const testAPI = async () => {
        setLoading(true);

        // Test getting categories
        api.getFlashcardCategories((data) => {
            console.log('Categories:', data);
            setCategories(data);
        });

        // Test getting flashcards
        api.getFlashcards({ limit: 5 }, (data) => {
            console.log('Flashcards:', data);
            setFlashcards(data.flashcards || []);
            setLoading(false);
        });

        // Test getting practice set
        api.getPracticeSet(3, (data) => {
            console.log('Practice set:', data);
        });
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            const chunks = [];

            recorder.ondataavailable = (e) => {
                chunks.push(e.data);
            };

            recorder.onstop = async () => {
                const audioBlob = new Blob(chunks, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });

                // Test transcription
                api.transcribeAudio(audioFile, '1', (result) => {
                    console.log('Transcription result:', result);
                    if (result.transcription) {
                        setTranscription(result.transcription);
                    }
                });

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
                setAudioChunks([]);
                setIsRecording(false);
            };

            recorder.start();
            setMediaRecorder(recorder);
            setIsRecording(true);
            setAudioChunks(chunks);

            // Stop after 5 seconds for testing
            setTimeout(() => {
                if (recorder.state === 'recording') {
                    recorder.stop();
                }
            }, 5000);

        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Please check permissions.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    };

    const testSubmitAnswer = () => {
        // Test submitting an answer
        api.submitFlashcardAnswer(
            '1',
            'hej hvordan har du det',
            true,
            'typing',
            3000,
            (result) => {
                console.log('Submit answer result:', result);
                alert('Answer submitted! Check console for result.');
            }
        );
    };

    return (
        <NarrowColumn>
            <h1>Verbal Flashcards</h1>

            <div style={{ marginBottom: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
                <h3>API Test Results:</h3>
                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <>
                        <p><strong>Categories found:</strong> {categories.length}</p>
                        <p><strong>Flashcards loaded:</strong> {flashcards.length}</p>
                        <ul>
                            {flashcards.map(card => (
                                <li key={card.id}>{card.prompt} - {card.difficulty}</li>
                            ))}
                        </ul>
                    </>
                )}
            </div>

            <div style={{ marginBottom: '20px', padding: '15px', background: '#e3f2fd', borderRadius: '8px' }}>
                <h3>Audio Transcription Test:</h3>
                <button
                    onClick={startRecording}
                    disabled={isRecording}
                    style={{ marginRight: '10px', padding: '8px 16px' }}
                >
                    {isRecording ? 'Recording...' : 'Start Recording (5s)'}
                </button>
                <button
                    onClick={stopRecording}
                    disabled={!isRecording}
                    style={{ padding: '8px 16px' }}
                >
                    Stop Recording
                </button>
                {transcription && (
                    <div style={{ marginTop: '10px' }}>
                        <strong>Transcription:</strong>
                        <p style={{ background: 'white', padding: '10px', borderRadius: '4px' }}>
                            {transcription}
                        </p>
                    </div>
                )}
            </div>

            <div style={{ marginBottom: '20px', padding: '15px', background: '#e8f5e9', borderRadius: '8px' }}>
                <h3>Submit Answer Test:</h3>
                <button
                    onClick={testSubmitAnswer}
                    style={{ padding: '8px 16px' }}
                >
                    Test Submit Answer
                </button>
                <p style={{ fontSize: '0.9em', color: '#666', marginTop: '10px' }}>
                    This will submit a mock answer for flashcard ID 1
                </p>
            </div>
        </NarrowColumn>
    );
}
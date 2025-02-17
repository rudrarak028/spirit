import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Mic, MicOff, RefreshCw, PauseCircle } from 'lucide-react';

interface Mantra {
  id: number;
  text: string;
  count: number;
  target?: number;
}

function App() {
  const [mantras] = useState<Mantra[]>([
    { id: 1, text: "Om Namah Shivaya", count: 0, target: 108 },
    { id: 2, text: "Hare Krishna", count: 0, target: 108 },
    { id: 3, text: "Om Mani Padme Hum", count: 0 },
    { id: 4, text: "Gayatri Mantra", count: 0 },
  ]);
  
  const [selectedMantra, setSelectedMantra] = useState<Mantra>(mantras[0]);
  const [isListening, setIsListening] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [lastRecognizedText, setLastRecognizedText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  
  const recognitionRef = useRef<any>(null);
  const isInitializedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const noSpeechTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const restartRecognition = () => {
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        setTimeout(() => {
          if (isListening) {
            recognitionRef.current.start();
            setFeedback("Restarting listening...");
          }
        }, 100);
      } catch (error) {
        console.error('Error restarting recognition:', error);
      }
    }
  };

  const resetNoSpeechTimeout = () => {
    if (noSpeechTimeoutRef.current) {
      clearTimeout(noSpeechTimeoutRef.current);
    }
    noSpeechTimeoutRef.current = setTimeout(() => {
      if (isListening) {
        restartRecognition();
      }
    }, 10000); // Restart after 10 seconds of no speech
  };

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) {
      setFeedback("Speech recognition is not supported in this browser.");
      return;
    }

    if (!isInitializedRef.current) {
      // @ts-ignore
      recognitionRef.current = new webkitSpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        resetNoSpeechTimeout(); // Reset timeout on speech detection
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.toLowerCase().trim();
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
            setLastRecognizedText(transcript);
            
            // Check for mantra match with improved matching
            const mantraWords = selectedMantra.text.toLowerCase().split(' ');
            const recognizedWords = transcript.split(' ');
            
            let matchCount = 0;
            let totalWords = mantraWords.length;
            
            mantraWords.forEach(mantraWord => {
              if (recognizedWords.some(word => 
                word.includes(mantraWord) || mantraWord.includes(word) ||
                // Add phonetic similarity check
                (word.length > 3 && mantraWord.length > 3 &&
                 (word.includes(mantraWord.substring(0, 3)) ||
                  mantraWord.includes(word.substring(0, 3))))
              )) {
                matchCount++;
              }
            });

            const matchPercentage = (matchCount / totalWords) * 100;
            
            if (matchPercentage >= 70) { // Lowered threshold for better recognition
              setSelectedMantra(prev => ({
                ...prev,
                count: prev.count + 1
              }));
              setFeedback(`✓ Counted: ${selectedMantra.text}`);
            } else {
              setFeedback(`Heard: "${transcript}"`);
            }
          } else {
            interimTranscript += transcript;
            setInterimText(interimTranscript);
          }
        }
      };

      recognitionRef.current.onstart = () => {
        setFeedback("Listening... Please chant clearly");
        startAudioMonitoring();
        resetNoSpeechTimeout();
      };

      recognitionRef.current.onend = () => {
        if (isListening) {
          setTimeout(() => {
            if (isListening) {
              try {
                recognitionRef.current.start();
                setFeedback("Continuing to listen...");
              } catch (error) {
                console.error('Error restarting recognition:', error);
                setFeedback("Error restarting. Please try again.");
                setIsListening(false);
              }
            }
          }, 100);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'aborted') {
          return;
        }
        if (event.error === 'no-speech') {
          restartRecognition();
          return;
        }
        setFeedback(`Error: ${event.error}. Please try again.`);
      };

      recognitionRef.current.onnomatch = () => {
        setFeedback("Could not understand the mantra. Please try again.");
      };

      isInitializedRef.current = true;
    }

    return () => {
      if (noSpeechTimeoutRef.current) {
        clearTimeout(noSpeechTimeoutRef.current);
      }
      stopAudioMonitoring();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.error('Error stopping recognition:', error);
        }
      }
    };
  }, [selectedMantra.text, isListening]);

  const startAudioMonitoring = async () => {
    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      source.connect(analyserRef.current);
      
      const updateLevel = () => {
        if (!analyserRef.current || !isListening) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(average / 128);
        
        if (isListening) {
          requestAnimationFrame(updateLevel);
        }
      };
      
      updateLevel();
    } catch (error) {
      console.error('Error starting audio monitoring:', error);
      setFeedback("Please allow microphone access to use the mantra counter.");
    }
  };

  const stopAudioMonitoring = () => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setAudioLevel(0);
  };

  const toggleListening = () => {
    if (isListening) {
      if (noSpeechTimeoutRef.current) {
        clearTimeout(noSpeechTimeoutRef.current);
      }
      try {
        recognitionRef.current?.stop();
        stopAudioMonitoring();
        setFeedback("Listening stopped");
        setInterimText("");
      } catch (error) {
        console.error('Error stopping recognition:', error);
      }
    } else {
      try {
        recognitionRef.current?.start();
      } catch (error) {
        console.error('Error starting recognition:', error);
        setFeedback("Error starting recognition. Please refresh the page.");
      }
    }
    setIsListening(!isListening);
  };

  const resetCount = () => {
    setSelectedMantra(prev => ({ ...prev, count: 0 }));
    setFeedback("Counter reset");
    setLastRecognizedText("");
    setInterimText("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-indigo-900 mb-4">
            AI Mantra Counter
          </h1>
          <p className="text-indigo-600">
            Choose your mantra and start chanting
          </p>
        </header>

        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-6">
          <div className="grid grid-cols-2 gap-4 mb-8">
            {mantras.map((mantra) => (
              <button
                key={mantra.id}
                onClick={() => setSelectedMantra(mantra)}
                className={`p-4 rounded-lg transition-all ${
                  selectedMantra.id === mantra.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100'
                }`}
              >
                <div className="font-semibold">{mantra.text}</div>
                <div className="text-sm mt-1">
                  Count: {mantra.count}
                  {mantra.target && ` / ${mantra.target}`}
                </div>
              </button>
            ))}
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-indigo-900 mb-2">
              {selectedMantra.text}
            </h2>
            <div className="text-5xl font-bold text-indigo-600 mb-4">
              {selectedMantra.count}
              {selectedMantra.target && 
                <span className="text-indigo-400 text-2xl">
                  /{selectedMantra.target}
                </span>
              }
            </div>
            {isListening && (
              <div className="w-full max-w-md mx-auto h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-100"
                  style={{ width: `${Math.min(100, audioLevel * 100)}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={toggleListening}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ${
                isListening
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {isListening ? (
                <>
                  <MicOff size={20} /> Stop Listening
                </>
              ) : (
                <>
                  <Mic size={20} /> Start Listening
                </>
              )}
            </button>
            <button
              onClick={resetCount}
              className="flex items-center gap-2 px-6 py-3 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold"
            >
              <RefreshCw size={20} /> Reset
            </button>
          </div>

          <div className="mt-6 text-center space-y-2">
            <div className="text-indigo-600 font-medium">
              {feedback}
            </div>
            {isListening && interimText && (
              <div className="text-gray-600 italic">
                Hearing: "{interimText}"
              </div>
            )}
            {lastRecognizedText && (
              <div className="text-gray-500">
                Last recognized: "{lastRecognizedText}"
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
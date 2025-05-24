import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore'; // Removed unused Firestore imports for now
import { Video, ScreenShare, Mic, Upload, Download, Film, FileText, AlertTriangle, PlayCircle, Trash2, Settings2, Sparkles, ClipboardCopy, Loader2, Info } from 'lucide-react';

// IMPORTANT: Replace with your actual Firebase config if not using the Canvas environment
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
let app;
let auth;
let db; // Firestore instance

try {
    const fbConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : firebaseConfig;
    app = initializeApp(fbConfig);
    auth = getAuth(app);
    db = getFirestore(app); // Initialize db
} catch (error) {
    console.error("Error initializing Firebase:", error);
    if (!app && Object.values(firebaseConfig).every(val => val.startsWith("YOUR_"))) {
        console.warn("Firebase config is not set. Please replace placeholder values in the code.");
    } else if (!app) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    }
}

const AIHelperModal = ({ isOpen, onClose, mediaItem, showMessage }) => {
  const [keywords, setKeywords] = useState('');
  const [summary, setSummary] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTitle, setGeneratedTitle] = useState('');
  const [generatedDescription, setGeneratedDescription] = useState('');
  const [generatedIdeas, setGeneratedIdeas] = useState(null); // { suggested_video_titles: [], key_talking_points: [], promotional_blurb: '' }
  const apiKey = ""; // For Canvas environment, API key is injected

  useEffect(() => {
    // Reset state when modal opens for a new item or closes
    if (isOpen) {
      setKeywords('');
      setSummary('');
      setGeneratedTitle('');
      setGeneratedDescription('');
      setGeneratedIdeas(null);
    }
  }, [isOpen, mediaItem]);

  const handleGenerateTitleDesc = async () => {
    if (!keywords.trim()) {
      showMessage('Please enter some keywords.', 'error');
      return;
    }
    setIsGenerating(true);
    setGeneratedTitle('');
    setGeneratedDescription('');

    const prompt = `Based on the following keywords for a media recording: "${keywords}"

Generate:
1. A catchy and concise title (max 10 words).
2. A brief, engaging description (2-3 sentences, max 50 words).

Provide the title on the first line, prefixed with "Title: ".
Provide the description on subsequent lines, prefixed with "Description: ".
Example:
Title: Amazing Tips for Productivity
Description: Unlock your potential with these simple yet effective productivity hacks. Boost your focus and get more done every day!`;

    try {
      const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `API Error: ${response.status}`);
      }
      const result = await response.json();
      
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        const lines = text.split('\n');
        let title = '';
        let description = '';
        lines.forEach(line => {
          if (line.toLowerCase().startsWith('title:')) {
            title = line.substring(7).trim();
          } else if (line.toLowerCase().startsWith('description:')) {
            description = line.substring(12).trim();
          } else if (description) { // append to description if it has started
            description += '\n' + line.trim();
          }
        });
        setGeneratedTitle(title || "Could not extract title.");
        setGeneratedDescription(description || "Could not extract description.");
        showMessage('Title and description generated!', 'success');
      } else {
        throw new Error("Unexpected response structure from AI.");
      }
    } catch (error) {
      console.error('Error generating title/description:', error);
      showMessage(`AI Error: ${error.message}`, 'error');
      setGeneratedTitle('Error generating title.');
      setGeneratedDescription('Error generating description.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateContentIdeas = async () => {
    if (!summary.trim()) {
      showMessage('Please enter a brief summary of the document.', 'error');
      return;
    }
    setIsGenerating(true);
    setGeneratedIdeas(null);

    const prompt = `Based on the following summary of a document (e.g., PowerPoint or PDF): "${summary}"

Generate content ideas for creating a video presentation from this document.`;
    
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            "suggested_video_titles": {
              type: "ARRAY",
              description: "3-5 catchy and relevant video titles based on the document summary.",
              items: { type: "STRING" }
            },
            "key_talking_points": {
              type: "ARRAY",
              description: "3-5 key talking points or main ideas that should be covered in a video presentation.",
              items: { type: "STRING" }
            },
            "promotional_blurb": {
              type: "STRING",
              description: "A short (2-3 sentences) promotional blurb for a video created from this document."
            }
          },
          required: ["suggested_video_titles", "key_talking_points", "promotional_blurb"]
        }
      }
    };

    try {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `API Error: ${response.status}`);
      }
      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const jsonText = result.candidates[0].content.parts[0].text;
        const parsedJson = JSON.parse(jsonText);
        setGeneratedIdeas(parsedJson);
        showMessage('Content ideas generated!', 'success');
      } else {
        throw new Error("Unexpected response structure from AI for content ideas.");
      }
    } catch (error) {
      console.error('Error generating content ideas:', error);
      showMessage(`AI Error: ${error.message}`, 'error');
      setGeneratedIdeas({ suggested_video_titles: ["Error"], key_talking_points: ["Error"], promotional_blurb: "Error generating ideas." });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const copyToClipboard = (text) => {
    if (!text) return;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showMessage('Copied to clipboard!', 'success');
    } catch (err) {
      showMessage('Failed to copy.', 'error');
      console.error('Failed to copy text: ', err);
    }
    document.body.removeChild(textarea);
  };


  if (!isOpen || !mediaItem) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 md:p-8 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-slate-700 flex items-center">
            <Sparkles className="text-yellow-500 mr-2 h-6 w-6" /> AI Content Helper
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-2xl">&times;</button>
        </div>

        <p className="text-sm text-slate-600 mb-4">For: <span className="font-medium">{mediaItem.name}</span> ({mediaItem.type.toUpperCase()})</p>

        {(mediaItem.type === 'video' || mediaItem.type === 'audio') && (
          <div className="space-y-4">
            <div>
              <label htmlFor="keywords" className="block text-sm font-medium text-slate-700 mb-1">Enter Keywords:</label>
              <input
                type="text"
                id="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g., productivity tips, remote work, focus techniques"
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleGenerateTitleDesc}
              disabled={isGenerating}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-lg shadow-md disabled:opacity-70 flex items-center justify-center transition-colors"
            >
              {isGenerating ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : <Sparkles className="mr-2 h-5 w-5" />}
              Generate Title & Description
            </button>
            {generatedTitle && (
              <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 className="font-semibold text-slate-700 mb-1">Generated Title:</h4>
                <div className="flex items-start justify-between">
                  <p className="text-slate-600 break-words flex-grow mr-2">{generatedTitle}</p>
                  <button onClick={() => copyToClipboard(generatedTitle)} title="Copy title" className="text-slate-500 hover:text-indigo-600 p-1 rounded-md"><ClipboardCopy size={18}/></button>
                </div>
              </div>
            )}
            {generatedDescription && (
              <div className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 className="font-semibold text-slate-700 mb-1">Generated Description:</h4>
                 <div className="flex items-start justify-between">
                  <p className="text-slate-600 whitespace-pre-wrap break-words flex-grow mr-2">{generatedDescription}</p>
                  <button onClick={() => copyToClipboard(generatedDescription)} title="Copy description" className="text-slate-500 hover:text-indigo-600 p-1 rounded-md"><ClipboardCopy size={18}/></button>
                </div>
              </div>
            )}
          </div>
        )}

        {(mediaItem.type === 'pdf' || mediaItem.type === 'ppt') && (
          <div className="space-y-4">
            <div>
              <label htmlFor="summary" className="block text-sm font-medium text-slate-700 mb-1">Brief Summary of Document:</label>
              <textarea
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows="3"
                placeholder="e.g., This presentation covers Q3 financial results and future projections..."
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleGenerateContentIdeas}
              disabled={isGenerating}
              className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-2.5 px-4 rounded-lg shadow-md disabled:opacity-70 flex items-center justify-center transition-colors"
            >
              {isGenerating ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : <Sparkles className="mr-2 h-5 w-5" />}
              ✨ Generate Content Ideas
            </button>
            {generatedIdeas && (
              <div className="mt-4 space-y-3">
                {generatedIdeas.suggested_video_titles && (
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <h4 className="font-semibold text-slate-700 mb-2">Suggested Video Titles:</h4>
                    <ul className="list-disc list-inside text-slate-600 space-y-1">
                      {generatedIdeas.suggested_video_titles.map((title, index) => (
                        <li key={index} className="flex items-start justify-between">
                          <span className="flex-grow mr-2">{title}</span>
                          <button onClick={() => copyToClipboard(title)} title="Copy title" className="text-slate-500 hover:text-indigo-600 p-1 rounded-md flex-shrink-0"><ClipboardCopy size={16}/></button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {generatedIdeas.key_talking_points && (
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <h4 className="font-semibold text-slate-700 mb-2">Key Talking Points:</h4>
                    <ul className="list-disc list-inside text-slate-600 space-y-1">
                      {generatedIdeas.key_talking_points.map((point, index) => (
                         <li key={index} className="flex items-start justify-between">
                          <span className="flex-grow mr-2">{point}</span>
                          <button onClick={() => copyToClipboard(point)} title="Copy point" className="text-slate-500 hover:text-indigo-600 p-1 rounded-md flex-shrink-0"><ClipboardCopy size={16}/></button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {generatedIdeas.promotional_blurb && (
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <h4 className="font-semibold text-slate-700 mb-1">Promotional Blurb:</h4>
                    <div className="flex items-start justify-between">
                        <p className="text-slate-600 whitespace-pre-wrap break-words flex-grow mr-2">{generatedIdeas.promotional_blurb}</p>
                        <button onClick={() => copyToClipboard(generatedIdeas.promotional_blurb)} title="Copy blurb" className="text-slate-500 hover:text-indigo-600 p-1 rounded-md"><ClipboardCopy size={18}/></button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
         <button 
            onClick={onClose} 
            className="mt-8 w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium py-2.5 px-4 rounded-lg transition-colors"
        >
            Close
        </button>
      </div>
    </div>
  );
};


const App = () => {
  const [currentView, setCurrentView] = useState('record');
  const [mediaItems, setMediaItems] = useState([]);
  const [selectedMedia, setSelectedMedia] = useState(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const canvasRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const [message, setMessage] = useState({ text: '', type: 'info' });
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [showAIModal, setShowAIModal] = useState(false);
  const [aiModalMediaItem, setAiModalMediaItem] = useState(null);

  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-video-app';

  useEffect(() => {
    if (!auth) {
        console.error("Firebase auth is not initialized.");
        setMessage({ text: 'Firebase auth is not initialized.', type: 'error' });
        setIsAuthReady(true);
        return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        try {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }
        } catch (error) {
          console.error("Error signing in:", error);
          setMessage({ text: `Firebase Auth Error: ${error.message}`, type: 'error' });
        }
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);


  const showUserMessage = (text, type = 'info', duration = 3000) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: 'info' }), duration);
  };

  const handleStartRecording = async (type) => {
    if (isRecording) {
      showUserMessage('A recording is already in progress.', 'error');
      return;
    }
    setRecordingType(type);
    recordedChunksRef.current = [];
    let streamToRecord; 
    let displayStream = null; 
    let webcamStream = null; 

    // Hidden video elements for canvas drawing
    const screenVideoEl = document.getElementById('hiddenScreenVideoForCanvas');
    const webcamVideoEl = document.getElementById('hiddenWebcamVideoForCanvas');


    try {
      if (type === 'webcam') {
        streamToRecord = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } else if (type === 'screen') {
        streamToRecord = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true });
        if (streamToRecord.getAudioTracks().length === 0) {
            const micAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false});
            micAudioStream.getAudioTracks().forEach(track => streamToRecord.addTrack(track));
        }
      } else if (type === 'audio') {
        streamToRecord = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } else if (type === 'screen_webcam') {
        displayStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true });
        webcamStream = await navigator.mediaDevices.getUserMedia({ video: {width: 320, height: 240}, audio: true });
        
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("Canvas element not found.");
        const ctx = canvas.getContext('2d');
        canvas.width = 1280; 
        canvas.height = 720;

        if(screenVideoEl && webcamVideoEl){
            screenVideoEl.srcObject = displayStream;
            screenVideoEl.muted = true; 
            await screenVideoEl.play();

            webcamVideoEl.srcObject = webcamStream;
            webcamVideoEl.muted = true; 
            await webcamVideoEl.play();
        } else {
            throw new Error("Hidden video elements for canvas drawing not found.");
        }
        
        streamToRecord = canvas.captureStream(30); 

        const audioContext = new AudioContext();
        const mixedAudioDestination = audioContext.createMediaStreamDestination();

        if (displayStream.getAudioTracks().length > 0) {
            audioContext.createMediaStreamSource(displayStream).connect(mixedAudioDestination);
        }
        if (webcamStream.getAudioTracks().length > 0) {
            audioContext.createMediaStreamSource(webcamStream).connect(mixedAudioDestination); 
        }
        
        mixedAudioDestination.stream.getAudioTracks().forEach(track => streamToRecord.addTrack(track));
      } else {
        throw new Error('Invalid recording type');
      }

      mediaStreamRef.current = streamToRecord; 

      if (videoPreviewRef.current && (type === 'webcam' || type === 'screen')) {
        videoPreviewRef.current.srcObject = streamToRecord;
        videoPreviewRef.current.muted = true; 
        videoPreviewRef.current.play().catch(e => console.error("Preview play error:", e));
      }
      
      const options = { mimeType: 'video/mp4; codecs=avc1.42E01E' };
      if (type === 'audio') {
        options.mimeType = 'audio/webm; codecs=opus';
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'audio/ogg; codecs=opus';
            if (!MediaRecorder.isTypeSupported(options.mimeType)) delete options.mimeType;
        }
      } else if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm; codecs=vp9'; 
         if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm; codecs=vp8';
            if (!MediaRecorder.isTypeSupported(options.mimeType)) delete options.mimeType;
         }
      }

      mediaRecorderRef.current = new MediaRecorder(streamToRecord, options);
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const mimeType = mediaRecorderRef.current?.mimeType || (type === 'audio' ? 'audio/webm' : 'video/webm');
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const fileExtension = mimeType.split('/')[1].split(';')[0];
        const newItem = {
          id: crypto.randomUUID(),
          name: `${type}_recording_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.${fileExtension}`,
          type: type === 'audio' ? 'audio' : 'video',
          url,
          file: new File([blob], `${type}_recording.${fileExtension}`, { type: mimeType }),
          source: 'recorded',
          timestamp: new Date().toISOString(),
        };
        setMediaItems(prev => [...prev, newItem]);
        setSelectedMedia(newItem); 
        showUserMessage(`${type.charAt(0).toUpperCase() + type.slice(1)} recording saved.`, 'success');
        
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if (displayStream) displayStream.getTracks().forEach(track => track.stop());
        if (webcamStream) webcamStream.getTracks().forEach(track => track.stop());

        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
        
        setIsRecording(false); 
        setRecordingType(null);
      };
      
      setIsRecording(true); 
      mediaRecorderRef.current.start();

      if (type === 'screen_webcam' && canvasRef.current && screenVideoEl && webcamVideoEl) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
            const drawFrames = () => {
                if (!isRecording || !mediaStreamRef.current || !mediaStreamRef.current.active) return; 
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(screenVideoEl, 0, 0, canvas.width, canvas.height);
                const webcamDrawWidth = canvas.width / 4.5;
                const webcamDrawHeight = (webcamVideoEl.videoHeight / webcamVideoEl.videoWidth) * webcamDrawWidth;
                ctx.drawImage(webcamVideoEl, canvas.width - webcamDrawWidth - 20, canvas.height - webcamDrawHeight - 20, webcamDrawWidth, webcamDrawHeight);
                requestAnimationFrame(drawFrames);
            };
            drawFrames();
      }
      showUserMessage(`Started ${type} recording...`, 'info');
    } catch (err) {
      console.error("Error starting recording:", err);
      showUserMessage(`Error starting ${type} recording: ${err.message}`, 'error');
      if (streamToRecord) streamToRecord.getTracks().forEach(track => track.stop());
      if (displayStream) displayStream.getTracks().forEach(track => track.stop());
      if (webcamStream) webcamStream.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      setIsRecording(false);
      setRecordingType(null);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      setIsRecording(false);
      setRecordingType(null);
      if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
    }
  };

  const handleFileUpload = (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    const newItems = files.map(file => {
      const fileType = file.type.startsWith('video/') ? 'video' : 
                       file.type.startsWith('audio/') ? 'audio' : 
                       (file.name.endsWith('.pdf') || file.type === 'application/pdf') ? 'pdf' :
                       (file.name.endsWith('.pptx') || file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') ? 'ppt' : 
                       'file';
      return {
        id: crypto.randomUUID(), name: file.name, type: fileType,
        url: URL.createObjectURL(file), file, source: 'uploaded',
        timestamp: new Date().toISOString(),
      };
    });
    setMediaItems(prev => [...prev, ...newItems]);
    if (newItems.length > 0) setSelectedMedia(newItems[0]); 
    showUserMessage(`${newItems.length} file(s) uploaded.`, 'success');
    event.target.value = null;
  };

  const handleExportMedia = (item) => {
    if (!item || !item.url) {
      showUserMessage('No media selected or URL is invalid for export.', 'error');
      return;
    }
    const a = document.createElement('a');
    a.href = item.url;
    let extension = item.name.includes('.') ? item.name.split('.').pop() : 'bin';
    if (item.type === 'video' && !['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(extension)) extension = 'webm';
    else if (item.type === 'audio' && !['mp3', 'wav', 'ogg', 'aac', 'webm'].includes(extension)) extension = 'webm';
    else if (item.type === 'pdf') extension = 'pdf';
    else if (item.type === 'ppt') extension = 'pptx';
    a.download = item.name || `media_export.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showUserMessage(`Exporting ${item.name}...`, 'success');
  };

  const handleDeleteMedia = (itemId) => {
    const itemToDelete = mediaItems.find(item => item.id === itemId);
    if (itemToDelete && itemToDelete.url.startsWith('blob:')) {
      URL.revokeObjectURL(itemToDelete.url);
    }
    setMediaItems(prev => prev.filter(item => item.id !== itemId));
    if (selectedMedia && selectedMedia.id === itemId) setSelectedMedia(null);
    showUserMessage('Media item deleted.', 'info');
  };
  
  const openAIModalForMedia = (item) => {
    setAiModalMediaItem(item);
    setShowAIModal(true);
  };

  const renderMessage = () => {
    if (!message.text) return null;
    const bgColor = message.type === 'error' ? 'bg-red-600' : message.type === 'success' ? 'bg-green-600' : 'bg-blue-600';
    return (
      <div className={`fixed bottom-5 right-5 p-4 rounded-lg text-white shadow-xl ${bgColor} z-[1000] flex items-center transition-opacity duration-300 ease-in-out ${message.text ? 'opacity-100' : 'opacity-0'}`}>
        {message.type === 'error' && <AlertTriangle className="mr-3 flex-shrink-0" />}
        {message.type === 'success' && <Info className="mr-3 flex-shrink-0" />} {/* Changed Film to Info for general success */}
        <span className="flex-grow">{message.text}</span>
        <button onClick={() => setMessage({ text: '', type: 'info' })} className="ml-4 text-2xl font-semibold hover:text-gray-200 transition-colors">&times;</button>
      </div>
    );
  };

  const Sidebar = () => (
    <div className="w-72 bg-slate-800 text-slate-100 p-6 space-y-5 flex flex-col shadow-lg">
      <h1 className="text-3xl font-bold mb-8 text-indigo-400 tracking-tight">Video Studio Pro</h1>
      <nav className="flex-grow">
        <ul className="space-y-2">
          {[
            { view: 'record', label: 'Record Media', icon: Video },
            { view: 'uploads', label: 'Upload Files', icon: Upload },
            { view: 'studio', label: 'Media Studio', icon: Settings2 },
          ].map(navItem => (
            <li key={navItem.view}>
              <button 
                onClick={() => setCurrentView(navItem.view)} 
                className={`w-full flex items-center p-3 rounded-lg text-left transition-all duration-200 ease-in-out
                            ${currentView === navItem.view ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-700 hover:text-indigo-300'}`}
              >
                <navItem.icon className="mr-3 h-5 w-5 flex-shrink-0" /> 
                {navItem.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="text-xs text-slate-400 border-t border-slate-700 pt-4">
        <p>User ID: <span className="font-mono">{isAuthReady && userId ? userId.substring(0,12)+"..." : "Initializing..."}</span></p>
        <p>App ID: <span className="font-mono">{appId}</span></p>
        <p className="mt-2">Status: {isRecording ? <span className="text-red-400">Recording...</span> : <span className="text-green-400">Idle</span>}</p>
      </div>
    </div>
  );

  const RecordView = () => (
    <div className="p-8 space-y-8">
      <h2 className="text-4xl font-semibold text-slate-700 tracking-tight">Create New Recording</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { type: 'webcam', label: 'Webcam', icon: Video, color: 'bg-sky-500 hover:bg-sky-600' },
          { type: 'screen', label: 'Screen', icon: ScreenShare, color: 'bg-emerald-500 hover:bg-emerald-600' },
          { type: 'audio', label: 'Audio Only', icon: Mic, color: 'bg-violet-500 hover:bg-violet-600' },
          { type: 'screen_webcam', label: 'Screen + Cam', icon: () => <><ScreenShare className="mr-1.5 h-5 w-5" /><Video className="h-5 w-5" /></>, color: 'bg-teal-500 hover:bg-teal-600' },
        ].map(btn => (
          <button 
            key={btn.type} onClick={() => handleStartRecording(btn.type)} 
            disabled={isRecording && recordingType !== btn.type} 
            className={`text-white font-semibold py-3.5 px-5 rounded-lg shadow-md disabled:opacity-60 disabled:cursor-not-allowed 
                        flex items-center justify-center transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 
                        ${btn.color} ${isRecording && recordingType === btn.type ? 'ring-4 ring-yellow-400' : 'focus:ring-indigo-500'}`}
          >
            {typeof btn.icon === 'function' ? btn.icon() : <btn.icon className="mr-2.5 h-5 w-5" />} 
            {btn.label}
          </button>
        ))}
      </div>
      {isRecording && (
        <div className="mt-6 p-5 bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-700 flex items-center justify-between shadow">
          <p className="font-medium">Recording <span className="font-bold">{recordingType?.replace('_', ' + ')}</span>... </p>
          <button onClick={handleStopRecording} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 px-5 rounded-lg shadow-md transition-colors">
            Stop Recording
          </button>
        </div>
      )}
      <div className="mt-8">
        <h3 className="text-2xl font-semibold text-slate-600 mb-3">Live Preview</h3>
        <video 
            ref={videoPreviewRef} 
            className="w-full max-w-xl bg-slate-200 rounded-lg shadow-inner border border-slate-300" 
            style={{ display: (isRecording && (recordingType === 'webcam' || recordingType === 'screen')) ? 'block' : 'none' }} 
            playsInline autoPlay muted>
        </video>
        <canvas 
            ref={canvasRef} 
            className="w-full max-w-xl bg-slate-200 rounded-lg shadow-inner border border-slate-300" 
            style={{ display: (isRecording && recordingType === 'screen_webcam') ? 'block' : 'none' }}>
        </canvas>
        {/* These hidden videos are crucial for the canvas screen_webcam recording to function */}
        <video id="hiddenScreenVideoForCanvas" playsInline autoPlay muted style={{display: 'none'}}></video>
        <video id="hiddenWebcamVideoForCanvas" playsInline autoPlay muted style={{display: 'none'}}></video>

        {isRecording && recordingType === 'audio' && <p className="text-slate-500 text-lg p-4 bg-slate-100 rounded-md shadow">Audio recording in progress... 🎤</p>}
        {!isRecording && (!recordingType || (recordingType !== 'audio')) && <p className="text-slate-500">Preview will appear here once recording starts.</p>}
      </div>
    </div>
  );

  const UploadsView = () => (
    <div className="p-8 space-y-8">
      <h2 className="text-4xl font-semibold text-slate-700 tracking-tight">Upload Your Files</h2>
      <div className="p-8 border-2 border-dashed border-slate-300 rounded-xl hover:border-indigo-500 transition-colors bg-slate-50 hover:bg-indigo-50 group">
        <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center text-slate-500 group-hover:text-indigo-600">
          <Upload size={56} className="mb-3 text-slate-400 group-hover:text-indigo-500 transition-colors" />
          <span className="font-semibold text-lg">Click to browse or drag & drop files</span>
          <span className="text-sm mt-1">Supports Videos, Audio, PDFs, and PowerPoint presentations.</span>
        </label>
        <input 
            id="file-upload" type="file" multiple onChange={handleFileUpload} className="hidden" 
            accept="video/*,audio/*,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,.mkv,.mov,.avi" 
        />
      </div>
    </div>
  );

  const MediaItemCard = ({ item }) => (
    <div className="bg-white p-5 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 ease-in-out flex flex-col justify-between border border-slate-200">
      <div>
        <div className="flex items-start mb-3">
          {item.type === 'video' && <Film className="text-sky-500 mr-3 h-6 w-6 flex-shrink-0" />}
          {item.type === 'audio' && <Mic className="text-violet-500 mr-3 h-6 w-6 flex-shrink-0" />}
          {item.type === 'pdf' && <FileText className="text-red-500 mr-3 h-6 w-6 flex-shrink-0" />}
          {item.type === 'ppt' && <FileText className="text-orange-500 mr-3 h-6 w-6 flex-shrink-0" />}
          {item.type === 'file' && <FileText className="text-slate-500 mr-3 h-6 w-6 flex-shrink-0" />}
          <h4 className="font-semibold text-slate-800 text-base leading-tight break-all" title={item.name}>{item.name}</h4>
        </div>
        <p className="text-xs text-slate-500 mb-1">Type: <span className="font-medium text-slate-600">{item.type.toUpperCase()}</span> | Source: <span className="font-medium text-slate-600">{item.source}</span></p>
        <p className="text-xs text-slate-500 mb-4">Added: {new Date(item.timestamp).toLocaleString()}</p>
      </div>
      <div className="flex flex-col space-y-2 mt-auto">
        <div className="flex space-x-2">
            {(item.type === 'video' || item.type === 'audio') && (
            <button onClick={() => { setSelectedMedia(item); setCurrentView('studio');}} className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center transition-colors shadow-sm hover:shadow-md">
                <PlayCircle size={18} className="mr-1.5" /> Preview
            </button>
            )}
            <button onClick={() => handleExportMedia(item)} className={`flex-1 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center transition-colors shadow-sm hover:shadow-md ${(item.type !== 'video' && item.type !== 'audio') ? 'w-full' : ''}`}>
                <Download size={18} className="mr-1.5" /> Export
            </button>
        </div>
        <div className="flex space-x-2">
            <button 
                onClick={() => openAIModalForMedia(item)} 
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center transition-colors shadow-sm hover:shadow-md"
            >
                <Sparkles size={18} className="mr-1.5" /> AI Tools
            </button>
            <button onClick={() => handleDeleteMedia(item.id)} className="flex-1 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center transition-colors shadow-sm hover:shadow-md">
                <Trash2 size={18} className="mr-1.5" /> Delete
            </button>
        </div>
      </div>
    </div>
  );

  const StudioView = () => (
    <div className="p-8 space-y-8">
      <h2 className="text-4xl font-semibold text-slate-700 tracking-tight">Media Studio</h2>
      {selectedMedia && (selectedMedia.type === 'video' || selectedMedia.type === 'audio') ? (
        <div className="bg-slate-50 p-6 rounded-xl shadow-lg border border-slate-200">
          <h3 className="text-2xl font-semibold text-slate-700 mb-4">Previewing: <span className="text-indigo-600">{selectedMedia.name}</span></h3>
          {selectedMedia.type === 'video' && (
            <video key={selectedMedia.id} controls src={selectedMedia.url} className="w-full max-w-3xl mx-auto rounded-lg shadow-md bg-black border border-slate-300 aspect-video">
              Your browser does not support the video tag.
            </video>
          )}
          {selectedMedia.type === 'audio' && (
            <audio key={selectedMedia.id} controls src={selectedMedia.url} className="w-full max-w-3xl mx-auto my-4">
              Your browser does not support the audio element.
            </audio>
          )}
          <div className="mt-6 p-5 bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-800">
            <p className="font-semibold text-lg mb-2">🚧 Basic Video Editing Features (Coming Soon!)</p>
            <ul className="list-disc list-inside text-sm space-y-1">
              <li>Trim video/audio segments</li><li>Combine multiple clips</li>
              <li>Add custom audio overlays</li><li>Reliable MP4 export (using FFmpeg.wasm)</li>
              <li>✨ AI-powered smart trimming suggestions</li>
              <li>✨ AI-generated chapter markers/summaries</li>
            </ul>
            <p className="mt-3 text-xs italic">Advanced features often require complex libraries and processing.</p>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-slate-50 rounded-xl shadow border border-slate-200">
          <Film size={64} className="mx-auto text-slate-400 mb-6" />
          <p className="text-xl text-slate-500">Select a video or audio item to preview.</p>
          <p className="text-sm text-slate-400 mt-3">Use 'Record' or 'Uploads' to add media. Then try the ✨ AI Tools!</p>
        </div>
      )}
    </div>
  );

  const renderCurrentView = () => {
    switch (currentView) {
      case 'record': return <RecordView />;
      case 'uploads': return <UploadsView />;
      case 'studio': return <StudioView />;
      default: return <RecordView />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 font-sans antialiased">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 p-0 md:p-2 lg:p-4 overflow-y-auto">
          {renderCurrentView()}
          { mediaItems.length > 0 && (
            <div className="px-4 md:px-8 py-8 mt-2">
              <h3 className="text-3xl font-semibold text-slate-700 mb-6 tracking-tight">
                {currentView === 'studio' ? 'All Media Library' : 
                 currentView === 'uploads' ? 'Uploaded Files' : 'Session Recordings'}
              </h3>
              { (currentView === 'studio' || 
                 (currentView === 'uploads' && mediaItems.some(item => item.source === 'uploaded')) ||
                 (currentView === 'record' && mediaItems.some(item => item.source === 'recorded'))) ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-6"> {/* Adjusted grid for better fit */}
                  {mediaItems
                    .filter(item => {
                      if (currentView === 'studio') return true;
                      if (currentView === 'uploads') return item.source === 'uploaded';
                      if (currentView === 'record') return item.source === 'recorded';
                      return false;
                    })
                    .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .map(item => <MediaItemCard key={item.id} item={item} />)}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8 bg-white rounded-lg shadow">
                  No {currentView === 'uploads' ? 'uploads' : 'recordings'} yet.
                </p>
              )}
            </div>
          )}
        </div>
      </main>
      {renderMessage()}
      <AIHelperModal 
        isOpen={showAIModal} 
        onClose={() => setShowAIModal(false)} 
        mediaItem={aiModalMediaItem}
        showMessage={showUserMessage} 
      />
    </div>
  );
};

export default App;

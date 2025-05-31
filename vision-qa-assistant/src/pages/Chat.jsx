import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase/config';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  getDocs,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import {
  Box,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Avatar,
  List,
  Switch,
  FormControlLabel,
  ListItem,
  ListItemAvatar,
  ListItemText,
  IconButton,
  CircularProgress,
  AppBar,
  Toolbar,
  Divider,
  Dialog,
  DialogContent,
  DialogActions,
  Drawer,
  ListItemButton,
  ListItemIcon
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import LogoutIcon from '@mui/icons-material/Logout';
import ImageIcon from '@mui/icons-material/Image';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CloseIcon from '@mui/icons-material/Close';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini API with a hardcoded API key
const genAI = new GoogleGenerativeAI('AIzaSyAJnJkBXm2QHGy41zqgWd4eLR871zko67M');

const Chat = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState('');
  // Store conversation history for context
  const [conversationHistory, setConversationHistory] = useState([]);
  // Store the last image for follow-up questions
  const [lastImageData, setLastImageData] = useState(null);
  // Live camera mode
  const [liveCameraMode, setLiveCameraMode] = useState(false);
  const [liveCameraDialog, setLiveCameraDialog] = useState(false);
  const liveCanvasRef = useRef(null);
  const frameCapturerRef = useRef(null);
  const [processingLiveQuestion, setProcessingLiveQuestion] = useState(false);
  
  // Voice output settings
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const speechSynthesis = window.speechSynthesis;
  const speechUtteranceRef = useRef(null);
  
  // Voice input (speech recognition) settings
  const [voiceInputEnabled, setVoiceInputEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);
  const lastProcessedTranscriptRef = useRef('');
  const silenceTimerRef = useRef(null);
  const lastSpeechTimeRef = useRef(Date.now());

  // Firestore chat history
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);

  // Check if user is logged in
  useEffect(() => {
    if (!currentUser) {
      navigate('/');
    } else {
      startNewChat();
      fetchChatHistory();
    }
  }, [currentUser, navigate]);

  // Auto-scroll to the bottom of the chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Start a new chat session
  const startNewChat = async () => {
    try {
      const chatRef = await addDoc(collection(db, `users/${currentUser.uid}/chats`), {
        title: `Chat ${new Date().toLocaleString()}`,
        createdAt: serverTimestamp(),
      });
      setCurrentChatId(chatRef.id);
      setMessages([]);
      setConversationHistory([]);
      setLastImageData(null);
      setInput('');
      setImage(null);
      setImagePreview(null);
      fetchChatHistory(); // Refresh chat history to include new chat
    } catch (error) {
      console.error('Error starting new chat:', error);
      setMessages(prev => [...prev, {
        text: `Error: Failed to start new chat`,
        sender: 'system',
        timestamp: new Date().toISOString()
      }]);
    }
  };

  // Fetch chat history
  const fetchChatHistory = async () => {
    try {
      const chatsQuery = query(
        collection(db, `users/${currentUser.uid}/chats`),
        orderBy('createdAt', 'desc')
      );
      const chatsSnapshot = await getDocs(chatsQuery);
      const chats = chatsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setChatHistory(chats);
    } catch (error) {
      console.error('Error fetching chat history:', error);
    }
  };

  // Load a previous chat
  const loadChat = async (chatId) => {
    try {
      setCurrentChatId(chatId);
      setMessages([]);
      setConversationHistory([]);
      setLastImageData(null);
      setInput('');
      setImage(null);
      setImagePreview(null);

      const messagesQuery = query(
        collection(db, `users/${currentUser.uid}/chats/${chatId}/messages`),
        orderBy('timestamp', 'asc')
      );
      const messagesSnapshot = await getDocs(messagesQuery);
      const loadedMessages = messagesSnapshot.docs.map(doc => doc.data());
      setMessages(loadedMessages);

      // Reconstruct conversation history for Gemini API
      const newHistory = [];
      let lastImage = null;
      loadedMessages.forEach(msg => {
        const parts = [];
        if (msg.text) parts.push({ text: msg.text });
        if (msg.image) {
          parts.push({
            inlineData: {
              data: msg.image.split(',')[1],
              mimeType: 'image/jpeg'
            }
          });
          if (msg.sender === 'user') {
            lastImage = {
              data: msg.image.split(',')[1],
              mimeType: 'image/jpeg'
            };
          }
        }
        newHistory.push({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts
        });
      });
      setConversationHistory(newHistory);
      setLastImageData(lastImage);
    } catch (error) {
      console.error('Error loading chat:', error);
      setMessages(prev => [...prev, {
        text: `Error: Failed to load chat`,
        sender: 'system',
        timestamp: new Date().toISOString()
      }]);
    }
  };
  
  // Speech synthesis function
  const speakText = useCallback((text) => {
    if (!voiceEnabled || !text) return;
    
    // Cancel any ongoing speech
    if (speaking) {
      speechSynthesis.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    speechUtteranceRef.current = utterance;
    
    // Set speech properties
    utterance.rate = 1.0; // Speed of speech (0.1 to 10)
    utterance.pitch = 1.0; // Pitch of voice (0 to 2)
    utterance.volume = 1.0; // Volume (0 to 1)
    
    // Event handlers
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    
    // Speak the text
    speechSynthesis.speak(utterance);
  }, [voiceEnabled, speaking]);
  
  // Stop speaking
  const stopSpeaking = useCallback(() => {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [speaking]);
  
  // Clean up speech synthesis when component unmounts
  useEffect(() => {
    return () => {
      if (speechSynthesis) {
        speechSynthesis.cancel();
      }
      // Also stop speech recognition if active
      stopListening();
    };
  }, []);
  
  // Function to handle silence detection and processing - defined outside useCallback to avoid circular references
  const handleSilenceDetection = useCallback((currentTranscript) => {
    if (currentTranscript && 
        currentTranscript.trim().length > 0 && 
        currentTranscript !== lastProcessedTranscriptRef.current && 
        !processingLiveQuestion) {
      
      // Update the last processed transcript
      lastProcessedTranscriptRef.current = currentTranscript;
      
      // Process the transcript
      const fakeEvent = { preventDefault: () => {} };
      handleLiveQuestion(fakeEvent);
    }
  }, [processingLiveQuestion]);

  // Initialize speech recognition
  const initSpeechRecognition = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('Speech recognition not supported in this browser');
      return false;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
      setListening(true);
      console.log('Speech recognition started');
    };
    
    recognition.onresult = (event) => {
      // Reset the silence timer since we got speech
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      
      // Update the last speech time
      lastSpeechTimeRef.current = Date.now();
      
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }
      
      if (finalTranscript) {
        const trimmedTranscript = finalTranscript.trim();
        setTranscript(trimmedTranscript);
        setInput(trimmedTranscript); // Update input with final transcript
        
        // Start a silence timer for 3 seconds to update query
        silenceTimerRef.current = setTimeout(() => {
          handleSilenceDetection(trimmedTranscript);
        }, 3000);
        
      } else if (interimTranscript) {
        // Just update the UI with interim results
        setTranscript(interimTranscript);
        setInput(interimTranscript);
        
        // Start a silence timer for 3 seconds
        silenceTimerRef.current = setTimeout(() => {
          handleSilenceDetection(interimTranscript);
        }, 3000);
      }
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      setListening(false);
    };
    
    recognition.onend = () => {
      // Only set listening to false if we're not supposed to be continuously listening
      if (!voiceInputEnabled) {
        setListening(false);
      } else {
        // Try to restart if we're supposed to be continuously listening
        try {
          recognition.start();
        } catch (e) {
          console.error('Could not restart speech recognition', e);
          setListening(false);
          setVoiceInputEnabled(false);
        }
      }
    };
    
    recognitionRef.current = recognition;
    return true;
  }, [voiceInputEnabled, handleSilenceDetection]);
  
  // Start listening for speech
  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      const initialized = initSpeechRecognition();
      if (!initialized) return;
    }
    
    // Clear any existing silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    
    // Reset the last speech time
    lastSpeechTimeRef.current = Date.now();
    
    try {
      recognitionRef.current.start();
    } catch (e) {
      console.error('Could not start speech recognition', e);
    }
  }, [initSpeechRecognition]);
  
  // Stop listening for speech
  const stopListening = useCallback(() => {
    // Clear any existing silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        setListening(false);
      } catch (e) {
        console.error('Error stopping speech recognition', e);
      }
    }
  }, []);
  
  // Toggle voice input
  const toggleVoiceInput = useCallback(() => {
    const newState = !voiceInputEnabled;
    setVoiceInputEnabled(newState);
    
    if (newState) {
      startListening();
    } else {
      stopListening();
      setTranscript('');
    }
  }, [voiceInputEnabled, startListening, stopListening]);
  
  // Automatically enable voice input when entering live camera mode
  useEffect(() => {
    if (liveCameraDialog) {
      // Reset the last processed transcript when opening the dialog
      lastProcessedTranscriptRef.current = '';
      
      // Auto-enable voice input when live camera dialog opens
      setVoiceInputEnabled(true);
      
      // Small delay to ensure everything is initialized
      setTimeout(() => {
        if (liveCameraDialog) { // Double-check it's still open
          startListening();
        }
      }, 500);
    } else {
      // Stop listening when dialog closes
      stopListening();
      setVoiceInputEnabled(false);
    }
  }, [liveCameraDialog, startListening, stopListening]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Camera handling functions
  const openCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      
      setCameraStream(stream);
      setCameraOpen(true);
      setLiveCameraMode(false);
      
      // Wait for dialog to open and then set video source
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setCameraError('Could not access camera. Please check permissions.');
    }
  };
  
  // Open live camera mode
  const openLiveCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: false
      });
      
      setCameraStream(stream);
      setLiveCameraDialog(true);
      setLiveCameraMode(true);
      
      // Wait for dialog to open and then set video source
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          // Start frame capture loop for live analysis
          startLiveFrameCapture();
        }
      }, 100);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setCameraError('Could not access camera. Please check permissions.');
    }
  };
  
  const startLiveFrameCapture = () => {
    if (frameCapturerRef.current) {
      cancelAnimationFrame(frameCapturerRef.current);
    }
    
    // We don't need to capture frames continuously, only when a question is asked
    // This saves resources and API calls
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setCameraOpen(false);
    setLiveCameraDialog(false);
    setLiveCameraMode(false);
    
    if (frameCapturerRef.current) {
      cancelAnimationFrame(frameCapturerRef.current);
      frameCapturerRef.current = null;
    }
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw current video frame to canvas
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL('image/jpeg');
      
      // Create a file from the data URL
      fetch(dataUrl)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
          setImage(file);
          setImagePreview(dataUrl);
          closeCamera();
        });
    }
  };

  // Capture current frame from live video
  const captureLiveFrame = () => {
    if (videoRef.current && liveCanvasRef.current) {
      const video = videoRef.current;
      const canvas = liveCanvasRef.current;
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw current video frame to canvas
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7); // Use lower quality for better performance
      
      return {
        dataUrl,
        width: canvas.width,
        height: canvas.height
      };
    }
    return null;
  };
  
  // Handle sending message in live camera mode
  const handleLiveQuestion = async (e) => {
    e.preventDefault();
    
    if (!input.trim() || !liveCameraMode || processingLiveQuestion) return;
    
    setProcessingLiveQuestion(true);
    
    // Capture current frame
    const frameData = captureLiveFrame();
    if (!frameData) {
      setProcessingLiveQuestion(false);
      return;
    }
    
    // Add user message to chat
    const userMessage = {
      text: input,
      image: frameData.dataUrl,
      sender: 'user',
      timestamp: new Date().toISOString(),
      isLiveFrame: true
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    
    // Save user message to Firestore
    try {
      await addDoc(collection(db, `users/${currentUser.uid}/chats/${currentChatId}/messages`), {
        ...userMessage,
        timestamp: Timestamp.fromDate(new Date(userMessage.timestamp))
      });
    } catch (error) {
      console.error('Error saving user message to Firestore:', error);
    }
    
    try {
      // Convert data URL to blob
      const response = await fetch(frameData.dataUrl);
      const blob = await response.blob();
      const file = new File([blob], 'live-frame.jpg', { type: 'image/jpeg' });
      
      // Extract base64 data
      const imageData = frameData.dataUrl.split(',')[1];
      
      // Use the initialized Gemini API with the recommended model
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      // Prepare content parts for this message
      const contentParts = [
        { text: input },
        {
          inlineData: {
            data: imageData,
            mimeType: 'image/jpeg'
          }
        }
      ];
      
      // Generate content
      const result = await model.generateContent({
        contents: [{ role: "user", parts: contentParts }],
      });

      const geminiResponse = result.response;
      let responseText = geminiResponse.text();
      
      // Clean up the response text to remove asterisks and markdown
      responseText = cleanResponseText(responseText);

      // Add AI response to chat
      const aiMessage = {
        text: responseText,
        sender: 'ai',
        timestamp: new Date().toISOString(),
        isLiveResponse: true
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      // Save AI response to Firestore
      try {
        await addDoc(collection(db, `users/${currentUser.uid}/chats/${currentChatId}/messages`), {
          ...aiMessage,
          timestamp: Timestamp.fromDate(new Date(aiMessage.timestamp))
        });
      } catch (error) {
        console.error('Error saving AI message to Firestore:', error);
      }
      
      // Speak the response if voice is enabled
      speakText(responseText);
      
    } catch (error) {
      console.error('Error generating live response:', error);
      
      // Add error message to chat
      const errorMessage = {
        text: `Error: ${error.message || 'Failed to analyze live frame'}`,
        sender: 'system',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMessage]);
      
      // Save error message to Firestore
      try {
        await addDoc(collection(db, `users/${currentUser.uid}/chats/${currentChatId}/messages`), {
          ...errorMessage,
          timestamp: Timestamp.fromDate(new Date(errorMessage.timestamp))
        });
      } catch (error) {
        console.error('Error saving error message to Firestore:', error);
      }
    } finally {
      setProcessingLiveQuestion(false);
    }
  };
  
  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    // If in live camera mode, use the live question handler
    if (liveCameraMode) {
      handleLiveQuestion(e);
      return;
    }
    
    if (!input.trim() && !image && !lastImageData) return;
    
    // Add user message to chat
    const userMessage = {
      text: input,
      image: imagePreview,
      sender: 'user',
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Save user message to Firestore
    try {
      await addDoc(collection(db, `users/${currentUser.uid}/chats/${currentChatId}/messages`), {
        ...userMessage,
        timestamp: Timestamp.fromDate(new Date(userMessage.timestamp))
      });
    } catch (error) {
      console.error('Error saving user message to Firestore:', error);
    }

    try {
      // Use the initialized Gemini API with the newer model
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      // Start a chat if we don't have one, or continue the existing chat
      let chat;
      let newHistory = [];
      
      if (conversationHistory.length === 0) {
        // Start a new chat
        chat = model.startChat();
      } else {
        // Continue existing chat with history
        chat = model.startChat({
          history: conversationHistory
        });
      }
      
      // Prepare content parts for this message
      const contentParts = [];
      
      // Add text if present
      if (input.trim()) {
        contentParts.push({ text: input });
      }
      
      // Add image if present (new image takes precedence over last image)
      if (image) {
        // Convert image to base64 data URI without the prefix
        const imageData = imagePreview.split(',')[1];
        
        contentParts.push({
          inlineData: {
            data: imageData,
            mimeType: image.type
          }
        });
        
        // Save this image for potential follow-up questions
        setLastImageData({
          data: imageData,
          mimeType: image.type
        });
      } 
      // If no new image but we have a previous image and this appears to be a follow-up question
      else if (lastImageData && input.trim()) {
        contentParts.push({
          inlineData: lastImageData
        });
      }

      // Send the message to the chat and get response
      const result = await chat.sendMessage(contentParts);
      const response = result.response;
      let responseText = response.text();
      
      // Clean up the response text to remove asterisks and markdown
      responseText = cleanResponseText(responseText);

      // Add AI response to chat
      const aiMessage = {
        text: responseText,
        sender: 'ai',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      // Save AI response to Firestore
      try {
        await addDoc(collection(db, `users/${currentUser.uid}/chats/${currentChatId}/messages`), {
          ...aiMessage,
          timestamp: Timestamp.fromDate(new Date(aiMessage.timestamp))
        });
      } catch (error) {
        console.error('Error saving AI message to Firestore:', error);
      }
      
      // Speak the response if voice is enabled
      speakText(responseText);
      
      // Update conversation history for context in future messages
      newHistory = [
        ...conversationHistory,
        { role: 'user', parts: contentParts },
        { role: 'model', parts: [{ text: responseText }] }
      ];
      
      setConversationHistory(newHistory);
    } catch (error) {
      console.error('Error generating response:', error);
      
      // Add error message to chat
      const errorMessage = {
        text: `Error: ${error.message || 'Failed to generate response'}`,
        sender: 'system',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMessage]);
      
      // Save error message to Firestore
      try {
        await addDoc(collection(db, `users/${currentUser.uid}/chats/${currentChatId}/messages`), {
          ...errorMessage,
          timestamp: Timestamp.fromDate(new Date(errorMessage.timestamp))
        });
      } catch (error) {
        console.error('Error saving error message to Firestore:', error);
      }
    } finally {
      setLoading(false);
      // Only clear the image if a new one was uploaded/captured
      // This allows the last image to persist for follow-up questions
      if (image) {
        setImage(null);
        setImagePreview(null);
      }
    }
  };

  // Function to clean up AI response text (remove asterisks and other markdown)
  const cleanResponseText = (text) => {
    if (!text) return '';
    
    // Remove asterisks used for bold/italic in markdown
    let cleaned = text.replace(/\*+/g, '');
    
    // Remove other markdown formatting if needed
    cleaned = cleaned.replace(/^\s*[-•]\s+/gm, ''); // Remove bullet points
    cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, ''); // Remove numbered lists
    
    return cleaned;
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      height: '100vh',
      width: '100vw',
      maxWidth: '100%',
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    }}>
      {/* Sidebar for Chat History */}
      <Drawer
        variant="permanent"
        sx={{
          width: 240,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 240,
            boxSizing: 'border-box',
            bgcolor: 'background.paper',
            borderRight: '1px solid rgba(0, 0, 0, 0.12)',
          },
        }}
      >
        <Toolbar>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={startNewChat}
            sx={{ width: '100%' }}
          >
            New Chat
          </Button>
        </Toolbar>
        <Divider />
        <List>
          {chatHistory.length === 0 ? (
            <ListItem>
              <Typography variant="body2" color="text.secondary">
                No previous chats
              </Typography>
            </ListItem>
          ) : (
            chatHistory.map(chat => (
              <ListItemButton
                key={chat.id}
                onClick={() => loadChat(chat.id)}
                selected={chat.id === currentChatId}
              >
                <ListItemIcon>
                  <HistoryIcon />
                </ListItemIcon>
                <ListItemText
                  primary={chat.title}
                  primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                />
              </ListItemButton>
            ))
          )}
        </List>
      </Drawer>

      {/* Main Content */}
      <Box sx={{ 
        flexGrow: 1, 
        display: 'flex', 
        flexDirection: 'column',
        width: 'calc(100% - 240px)',
      }}>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Vision-QA Assistant
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={voiceEnabled}
                  onChange={(e) => {
                    setVoiceEnabled(e.target.checked);
                    if (!e.target.checked) stopSpeaking();
                  }}
                  color="secondary"
                  size="small"
                />
              }
              label={<Typography variant="body2">Voice</Typography>}
              sx={{ mr: 2 }}
            />
            {currentUser && (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar 
                  src={currentUser.photoURL} 
                  alt={currentUser.displayName || 'User'} 
                  sx={{ mr: 1 }}
                />
                <Typography variant="body2" sx={{ mr: 2 }}>
                  {currentUser.displayName || currentUser.email}
                </Typography>
                <IconButton color="inherit" onClick={handleLogout}>
                  <LogoutIcon />
                </IconButton>
              </Box>
            )}
          </Toolbar>
        </AppBar>

        <Box 
          component="main" 
          sx={{ 
            flexGrow: 1, 
            display: 'flex', 
            flexDirection: 'column',
            p: { xs: 1, sm: 2 },
            overflow: 'hidden',
            width: '100%',
            maxWidth: '100%'
          }}
        >
          {/* Chat Messages */}
          <Paper 
            elevation={3} 
            sx={{ 
              flexGrow: 1, 
              mb: 2, 
              overflow: 'auto',
              p: 2
            }}
          >
            <List>
              {messages.length === 0 && (
                <Box 
                  sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    height: '100%',
                    opacity: 0.7
                  }}
                >
                  <ImageIcon sx={{ fontSize: 60, mb: 2, color: 'primary.main' }} />
                  <Typography variant="h6" color="text.secondary">
                    Upload an image and ask a question
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Example: "What objects do you see in this image?"
                  </Typography>
                </Box>
              )}
              
              {messages.map((message, index) => (
                <ListItem 
                  key={index} 
                  alignItems="flex-start"
                  sx={{ 
                    flexDirection: message.sender === 'user' ? 'row-reverse' : 'row',
                    mb: 2
                  }}
                >
                  <ListItemAvatar>
                    <Avatar 
                      src={message.sender === 'user' ? currentUser?.photoURL : null}
                      sx={{ 
                        bgcolor: message.sender === 'ai' 
                          ? 'primary.main' 
                          : message.sender === 'system' 
                            ? 'error.main' 
                            : 'secondary.main'
                      }}
                    >
                      {message.sender === 'ai' ? 'AI' : message.sender === 'system' ? '!' : null}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Typography 
                        variant="body1" 
                        sx={{ 
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}
                      >
                        {message.text}
                      </Typography>
                    }
                    secondary={
                      message.image && (
                        <Box 
                          component="img" 
                          src={message.image} 
                          alt="Uploaded"
                          sx={{ 
                            maxWidth: '100%', 
                            maxHeight: 300, 
                            mt: 1,
                            borderRadius: 1
                          }} 
                        />
                      )
                    }
                    sx={{
                      bgcolor: message.sender === 'user' 
                        ? 'rgba(144, 202, 249, 0.15)' 
                        : message.sender === 'system'
                          ? 'rgba(244, 67, 54, 0.15)'
                          : 'rgba(206, 147, 216, 0.15)',
                      p: 2,
                      borderRadius: 2,
                      maxWidth: '80%'
                    }}
                  />
                </ListItem>
              ))}
              <div ref={messagesEndRef} />
            </List>
          </Paper>

          {/* Message Input */}
          <Paper 
            component="form" 
            onSubmit={handleSendMessage}
            elevation={3} 
            sx={{ 
              p: 2, 
              display: 'flex', 
              alignItems: 'center',
              gap: 1
            }}
          >
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
            <IconButton 
              color="primary" 
              onClick={() => fileInputRef.current.click()}
              disabled={loading}
              title="Upload image"
            >
              <ImageIcon />
            </IconButton>
            
            <IconButton
              color="secondary"
              onClick={openCamera}
              disabled={loading}
              title="Take photo"
            >
              <CameraAltIcon />
            </IconButton>
            
            <IconButton
              color="success"
              onClick={openLiveCamera}
              disabled={loading}
              title="Live camera analysis"
              sx={{ ml: 0.5 }}
            >
              <CameraAltIcon sx={{ mr: 0.5 }} />
              <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>LIVE</Typography>
            </IconButton>
            
            {imagePreview && (
              <Box 
                component="img" 
                src={imagePreview} 
                alt="Preview" 
                sx={{ 
                  height: 40, 
                  width: 40, 
                  objectFit: 'cover',
                  borderRadius: 1
                }} 
              />
            )}
            
            <TextField
              fullWidth
              placeholder="Ask a question about the image..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              variant="outlined"
              size="small"
            />
            
            <Button 
              type="submit"
              variant="contained" 
              color="primary" 
              endIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
              disabled={loading || (!input.trim() && !image)}
            >
              Send
            </Button>
          </Paper>
        </Box>
      </Box>

      {/* Regular Camera Dialog */}
      <Dialog
        open={cameraOpen}
        onClose={closeCamera}
        maxWidth="md"
        fullWidth
      >
        <DialogContent sx={{ p: 0, position: 'relative', overflow: 'hidden' }}>
          {cameraError ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="error">{cameraError}</Typography>
            </Box>
          ) : (
            <Box sx={{ width: '100%', position: 'relative' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain' }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </Box>
          )}
          <IconButton
            sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.5)', color: 'white' }}
            onClick={closeCamera}
          >
            <CloseIcon />
          </IconButton>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', p: 2 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={captureImage}
            startIcon={<CameraAltIcon />}
            disabled={!!cameraError}
            sx={{ borderRadius: 20, px: 3 }}
          >
            Capture Photo
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Live Camera Analysis Dialog */}
      <Dialog
        open={liveCameraDialog}
        onClose={closeCamera}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { height: '90vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }
        }}
      >
        <AppBar position="static" color="primary" sx={{ borderRadius: '4px 4px 0 0' }}>
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Typography variant="h6" component="div">
              Live Camera Analysis
            </Typography>
            <IconButton color="inherit" onClick={closeCamera}>
              <CloseIcon />
            </IconButton>
          </Toolbar>
        </AppBar>
        
        <DialogContent sx={{ p: 0, position: 'relative', overflow: 'hidden', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {cameraError ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="error">{cameraError}</Typography>
            </Box>
          ) : (
            <Box sx={{ width: '100%', position: 'relative', flexGrow: 1 }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <canvas ref={liveCanvasRef} style={{ display: 'none' }} />
              
              {/* Overlay messages on video */}
              <Box 
                sx={{ 
                  position: 'absolute', 
                  bottom: 80, 
                  left: 0, 
                  right: 0, 
                  maxHeight: '40%',
                  overflowY: 'auto',
                  px: 2,
                  pb: 2
                }}
              >
                {messages.filter(msg => msg.isLiveFrame || msg.isLiveResponse).slice(-4).map((message, index) => (
                  <Paper 
                    key={index} 
                    elevation={3}
                    sx={{
                      p: 1.5,
                      mb: 1,
                      maxWidth: '80%',
                      ml: message.sender === 'user' ? 'auto' : 0,
                      mr: message.sender === 'ai' ? 'auto' : 0,
                      bgcolor: message.sender === 'user' 
                        ? 'rgba(144, 202, 249, 0.8)' 
                        : message.sender === 'system'
                          ? 'rgba(244, 67, 54, 0.8)'
                          : 'rgba(30, 30, 30, 0.8)',
                      color: message.sender === 'user' ? 'white' : message.sender === 'ai' ? 'white' : 'inherit',
                      borderRadius: 2,
                      backdropFilter: 'blur(4px)'
                    }}
                  >
                    <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                      {message.text}
                    </Typography>
                  </Paper>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        
        <DialogActions sx={{ p: 2, bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {/* Voice status indicator - always shown */}
            <Box 
              sx={{ 
                mb: 1, 
                p: 1, 
                borderRadius: 1, 
                bgcolor: listening ? 'rgba(144, 202, 249, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <Typography variant="body2" sx={{ fontStyle: 'italic', color: listening ? 'primary.main' : 'error.main' }}>
                {listening ? 'Listening for questions...' : 'Voice recognition paused'}
                {processingLiveQuestion && ' (Processing...)' }
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {listening && <CircularProgress size={16} color="primary" sx={{ mr: 1 }} />}
                <MicIcon fontSize="small" color={listening ? "primary" : "error"} />
              </Box>
            </Box>
            
            <Box sx={{ display: 'flex', width: '100%', alignItems: 'center' }}>
              <TextField
                fullWidth
                placeholder="Just speak your question or type here..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={processingLiveQuestion}
                variant="outlined"
                size="small"
                onKeyPress={(e) => e.key === 'Enter' && handleLiveQuestion(e)}
                sx={{ mr: 1 }}
              />
              
              {/* Manual send button as fallback */}
              <Button
                variant="contained"
                color="primary"
                onClick={handleLiveQuestion}
                disabled={!input.trim() || processingLiveQuestion}
                endIcon={processingLiveQuestion ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
              >
                Send
              </Button>
            </Box>
          </Box>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Chat;
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Box, 
  Button, 
  Container, 
  Typography, 
  Paper, 
  Divider,
  CircularProgress
} from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import AppleIcon from '@mui/icons-material/Apple';

const Login = () => {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError('');
      await signInWithGoogle();
      navigate('/chat');
    } catch (error) {
      console.error('Error signing in with Google:', error);
      setError('Failed to sign in with Google. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      setError('');
      await signInWithApple();
      navigate('/chat');
    } catch (error) {
      console.error('Error signing in with Apple:', error);
      setError('Failed to sign in with Apple. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h4" gutterBottom>
          Vision-QA Assistant
        </Typography>
        <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 3 }}>
          Upload images and ask questions to get AI-powered insights
        </Typography>
        
        {error && (
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}
        
        <Box sx={{ width: '100%', mt: 2 }}>
          <Button
            fullWidth
            variant="contained"
            sx={{ 
              py: 1.5, 
              backgroundColor: '#4285F4',
              '&:hover': { backgroundColor: '#3367D6' } 
            }}
            startIcon={<GoogleIcon />}
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Sign in with Google'}
          </Button>
          
          <Divider sx={{ my: 2 }}>OR</Divider>
          
          <Button
            fullWidth
            variant="contained"
            sx={{ 
              py: 1.5, 
              backgroundColor: '#000',
              '&:hover': { backgroundColor: '#333' } 
            }}
            startIcon={<AppleIcon />}
            onClick={handleAppleSignIn}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Sign in with Apple'}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default Login;

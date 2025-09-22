"""
Audio Analysis Processor
Handles comprehensive audio forensics and voice identification
"""

import asyncio
import hashlib
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np

# Lazy/defensive heavy deps
try:
    import librosa  # type: ignore
except Exception:  # pragma: no cover
    librosa = None  # type: ignore
try:
    import soundfile as sf  # type: ignore
except Exception:  # pragma: no cover
    sf = None  # type: ignore
from loguru import logger

from ..schemas.analysis_schemas import (
    AnalysisRequest,
    AudioAnalysisResult,
    VoiceIdentificationResult,
    AudioAuthenticityResult
)
from ..models import get_model_manager
from ..config import get_settings

settings = get_settings()


class AudioProcessor:
    """Advanced audio analysis processor for forensic evidence"""
    
    def __init__(self):
        self.model_manager = get_model_manager()
        self.supported_formats = settings.AUDIO_ALLOWED_FORMATS
        self.max_size = settings.AUDIO_MAX_SIZE
        self.confidence_threshold = settings.AUDIO_CONFIDENCE_THRESHOLD
        self.sample_rate = settings.AUDIO_SAMPLE_RATE
    
    async def analyze(self, file_path: str, request: AnalysisRequest) -> AudioAnalysisResult:
        """
        Perform comprehensive audio analysis
        
        Args:
            file_path: Path to the audio file
            request: Analysis request details
            
        Returns:
            Complete audio analysis results
        """
        start_time = time.time()
        
        try:
            # Load and validate audio
            audio_data, sample_rate = await self._load_audio(file_path)
            
            # Run all analysis components in parallel
            tasks = [
                self._identify_voice(audio_data, sample_rate, file_path),
                self._analyze_authenticity(audio_data, sample_rate, file_path),
                self._analyze_technical_properties(audio_data, sample_rate, file_path),
                self._transcribe_audio(audio_data, sample_rate),
                self._analyze_noise(audio_data, sample_rate),
                self._analyze_spectrum(audio_data, sample_rate)
            ]
            
            results = await asyncio.gather(*tasks)
            
            # Compile final results
            voice_identification = results[0]
            authenticity_analysis = results[1]
            technical_analysis = results[2]
            transcription = results[3]
            noise_analysis = results[4]
            spectrum_analysis = results[5]
            
            processing_time = time.time() - start_time
            
            # Calculate overall confidence
            overall_confidence = self._calculate_overall_confidence(
                voice_identification, authenticity_analysis, technical_analysis
            )
            
            return AudioAnalysisResult(
                analysis_id=request.analysis_id,
                evidence_id=request.evidence_id,
                confidence_score=overall_confidence,
                processing_time=processing_time,
                model_version="1.0.0",
                voice_identification=voice_identification,
                authenticity_analysis=authenticity_analysis,
                technical_analysis=technical_analysis,
                transcription=transcription,
                noise_analysis=noise_analysis,
                spectrum_analysis=spectrum_analysis,
                metadata={
                    "file_path": file_path,
                    "analysis_timestamp": datetime.utcnow().isoformat(),
                    "processor_version": "1.0.0"
                }
            )
            
        except Exception as e:
            logger.error(f"Error analyzing audio {file_path}: {e}")
            raise
    
    async def _load_audio(self, file_path: str) -> tuple[np.ndarray, int]:
        """Load and validate audio file"""
        try:
            # Load audio file
            if librosa is None:  # type: ignore
                raise ValueError("librosa not available")
            audio_data, sample_rate = librosa.load(file_path, sr=self.sample_rate)  # type: ignore
            
            # Validate audio properties
            duration = len(audio_data) / sample_rate
            
            if duration > 3600:  # 1 hour limit
                raise ValueError("Audio duration exceeds 1 hour limit")
            
            if len(audio_data) == 0:
                raise ValueError("Audio file is empty")
            
            logger.debug(f"Audio loaded: {duration:.2f}s duration, {sample_rate}Hz sample rate")
            return audio_data, sample_rate
            
        except Exception as e:
            logger.error(f"Failed to load audio {file_path}: {e}")
            raise
    
    async def _identify_voice(self, audio_data: np.ndarray, sample_rate: int, file_path: str) -> VoiceIdentificationResult:
        """Identify voice characteristics and speaker"""
        try:
            # Get voice identification model
            model = await self.model_manager.get_model("audio_voice_identifier")
            
            if model is None:
                logger.warning("Voice identification model not loaded, using fallback")
                return await self._fallback_voice_identification(audio_data, sample_rate)
            
            # Extract voice characteristics
            voice_characteristics = await self._extract_voice_characteristics(audio_data, sample_rate)
            
            # Run speaker identification (simulated)
            speaker_id = await self._identify_speaker(audio_data, sample_rate)
            
            # Calculate confidence
            confidence = 0.8 if speaker_id else 0.3
            
            return VoiceIdentificationResult(
                speaker_id=speaker_id,
                confidence=confidence,
                voice_characteristics=voice_characteristics,
                comparison_results=[]
            )
            
        except Exception as e:
            logger.error(f"Voice identification failed: {e}")
            return await self._fallback_voice_identification(audio_data, sample_rate)
    
    async def _fallback_voice_identification(self, audio_data: np.ndarray, sample_rate: int) -> VoiceIdentificationResult:
        """Fallback voice identification using basic techniques"""
        try:
            # Basic voice characteristics extraction
            voice_characteristics = await self._extract_basic_voice_characteristics(audio_data, sample_rate)
            
            # Simple speaker identification based on voice characteristics
            speaker_id = None
            confidence = 0.5
            
            # Check for voice activity
            if voice_characteristics.get("voice_activity_ratio", 0) > 0.1:
                confidence = 0.7
                speaker_id = "unknown_speaker"
            
            return VoiceIdentificationResult(
                speaker_id=speaker_id,
                confidence=confidence,
                voice_characteristics=voice_characteristics,
                comparison_results=[]
            )
            
        except Exception as e:
            logger.error(f"Fallback voice identification failed: {e}")
            return VoiceIdentificationResult(
                speaker_id=None,
                confidence=0.0,
                voice_characteristics={},
                comparison_results=[]
            )
    
    async def _analyze_authenticity(self, audio_data: np.ndarray, sample_rate: int, file_path: str) -> AudioAuthenticityResult:
        """Analyze audio authenticity and detect tampering"""
        try:
            # Detect tampering indicators
            tampering_indicators = await self._detect_tampering_indicators(audio_data, sample_rate)
            
            # Detect splicing points
            splicing_detection = await self._detect_splicing(audio_data, sample_rate)
            
            # Calculate authenticity confidence
            is_authentic = len(tampering_indicators) == 0 and len(splicing_detection) == 0
            confidence = 0.9 if is_authentic else max(0.1, 1.0 - len(tampering_indicators) * 0.2)
            
            return AudioAuthenticityResult(
                is_authentic=is_authentic,
                confidence=confidence,
                tampering_indicators=tampering_indicators,
                splicing_detection=splicing_detection
            )
            
        except Exception as e:
            logger.error(f"Authenticity analysis failed: {e}")
            return AudioAuthenticityResult(
                is_authentic=False,
                confidence=0.0,
                tampering_indicators=["Analysis failed"],
                splicing_detection=[]
            )
    
    async def _analyze_technical_properties(self, audio_data: np.ndarray, sample_rate: int, file_path: str) -> Dict[str, Any]:
        """Analyze technical properties of the audio"""
        try:
            # Calculate basic properties
            duration = len(audio_data) / sample_rate
            rms_energy = np.sqrt(np.mean(audio_data**2))
            zero_crossing_rate = float(np.mean(librosa.feature.zero_crossing_rate(audio_data)[0])) if librosa else 0.0  # type: ignore
            
            # Calculate spectral features
            spectral_centroid = float(np.mean(librosa.feature.spectral_centroid(y=audio_data, sr=sample_rate)[0])) if librosa else 0.0  # type: ignore
            spectral_rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=audio_data, sr=sample_rate)[0])) if librosa else 0.0  # type: ignore
            mfccs = librosa.feature.mfcc(y=audio_data, sr=sample_rate, n_mfcc=13) if librosa else np.zeros((13, 1))  # type: ignore
            mfcc_mean = np.mean(mfccs, axis=1)
            
            # Detect audio format and quality
            file_info = await self._get_audio_file_info(file_path)
            
            return {
                "duration": duration,
                "sample_rate": sample_rate,
                "channels": 1,  # Assuming mono for now
                "bit_depth": file_info.get("bit_depth", 16),
                "format": file_info.get("format", "unknown"),
                "rms_energy": float(rms_energy),
                "zero_crossing_rate": float(zero_crossing_rate),
                "spectral_centroid": float(spectral_centroid),
                "spectral_rolloff": float(spectral_rolloff),
                "mfcc_features": mfcc_mean.tolist(),
                "file_size": file_info.get("file_size", 0),
                "encoding": file_info.get("encoding", "unknown")
            }
            
        except Exception as e:
            logger.error(f"Technical analysis failed: {e}")
            return {"error": str(e)}
    
    async def _transcribe_audio(self, audio_data: np.ndarray, sample_rate: int) -> Optional[str]:
        """Transcribe audio to text"""
        try:
            # For now, return a placeholder transcription
            # In production, this would use a speech-to-text model like Whisper
            duration = len(audio_data) / sample_rate
            
            if duration < 1.0:
                return None
            
            # Simple placeholder transcription
            return "Audio transcription not implemented in this version"
            
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            return None
    
    async def _analyze_noise(self, audio_data: np.ndarray, sample_rate: int) -> Dict[str, Any]:
        """Analyze background noise and audio quality"""
        try:
            # Calculate noise floor
            noise_floor = np.percentile(np.abs(audio_data), 10)
            
            # Calculate signal-to-noise ratio
            signal_power = np.mean(audio_data**2)
            noise_power = noise_floor**2
            snr = 10 * np.log10(signal_power / noise_power) if noise_power > 0 else float('inf')
            
            # Detect clipping
            clipping_ratio = np.sum(np.abs(audio_data) > 0.95) / len(audio_data)
            
            # Analyze frequency content
            fft = np.fft.fft(audio_data)
            freqs = np.fft.fftfreq(len(audio_data), 1/sample_rate)
            power_spectrum = np.abs(fft)**2
            
            # Find dominant frequencies
            dominant_freqs = freqs[np.argsort(power_spectrum)[-5:]]
            
            return {
                "noise_floor": float(noise_floor),
                "signal_to_noise_ratio": float(snr),
                "clipping_ratio": float(clipping_ratio),
                "has_clipping": clipping_ratio > 0.01,
                "dominant_frequencies": dominant_freqs.tolist(),
                "audio_quality": "good" if snr > 20 and clipping_ratio < 0.01 else "poor"
            }
            
        except Exception as e:
            logger.error(f"Noise analysis failed: {e}")
            return {"error": str(e)}
    
    async def _analyze_spectrum(self, audio_data: np.ndarray, sample_rate: int) -> Dict[str, Any]:
        """Analyze audio spectrum and frequency content"""
        try:
            # Calculate spectral features
            spectral_centroids = librosa.feature.spectral_centroid(y=audio_data, sr=sample_rate)[0] if librosa else np.array([0.0])  # type: ignore
            spectral_rolloffs = librosa.feature.spectral_rolloff(y=audio_data, sr=sample_rate)[0] if librosa else np.array([0.0])  # type: ignore
            spectral_bandwidths = librosa.feature.spectral_bandwidth(y=audio_data, sr=sample_rate)[0] if librosa else np.array([0.0])  # type: ignore
            
            # Calculate chroma features
            chroma = librosa.feature.chroma_stft(y=audio_data, sr=sample_rate) if librosa else np.zeros((12, 1))  # type: ignore
            chroma_mean = np.mean(chroma, axis=1)
            
            # Calculate tonnetz features
            tonnetz = librosa.feature.tonnetz(y=audio_data, sr=sample_rate) if librosa else np.zeros((6, 1))  # type: ignore
            tonnetz_mean = np.mean(tonnetz, axis=1)
            
            return {
                "spectral_centroid_mean": float(np.mean(spectral_centroids)),
                "spectral_centroid_std": float(np.std(spectral_centroids)),
                "spectral_rolloff_mean": float(np.mean(spectral_rolloffs)),
                "spectral_bandwidth_mean": float(np.mean(spectral_bandwidths)),
                "chroma_features": chroma_mean.tolist(),
                "tonnetz_features": tonnetz_mean.tolist(),
                "frequency_range": {
                    "min": float(np.min(spectral_centroids)),
                    "max": float(np.max(spectral_centroids))
                }
            }
            
        except Exception as e:
            logger.error(f"Spectrum analysis failed: {e}")
            return {"error": str(e)}
    
    # Helper methods
    
    async def _extract_voice_characteristics(self, audio_data: np.ndarray, sample_rate: int) -> Dict[str, Any]:
        """Extract detailed voice characteristics"""
        try:
            # Extract MFCC features
            mfccs = librosa.feature.mfcc(y=audio_data, sr=sample_rate, n_mfcc=13) if librosa is not None else np.zeros((13, 1))  # type: ignore
            
            # Extract pitch features
            if librosa is not None:
                pitches, magnitudes = librosa.piptrack(y=audio_data, sr=sample_rate)  # type: ignore
                pitch_values = pitches[pitches > 0]
            else:
                magnitudes = np.abs(np.fft.rfft(audio_data))
                pitch_values = np.array([])
            
            # Extract formant-like features
            spectral_centroids = librosa.feature.spectral_centroid(y=audio_data, sr=sample_rate)[0] if librosa is not None else np.array([0.0])  # type: ignore
            
            return {
                "mfcc_mean": np.mean(mfccs, axis=1).tolist(),
                "mfcc_std": np.std(mfccs, axis=1).tolist(),
                "pitch_mean": float(np.mean(pitch_values)) if len(pitch_values) > 0 else 0.0,
                "pitch_std": float(np.std(pitch_values)) if len(pitch_values) > 0 else 0.0,
                "spectral_centroid_mean": float(np.mean(spectral_centroids)),
                "voice_activity_ratio": float(np.sum(magnitudes > 0.1) / len(magnitudes))
            }
            
        except Exception as e:
            logger.error(f"Voice characteristics extraction failed: {e}")
            return {}
    
    async def _extract_basic_voice_characteristics(self, audio_data: np.ndarray, sample_rate: int) -> Dict[str, Any]:
        """Extract basic voice characteristics using simple methods"""
        try:
            # Calculate basic statistics
            rms_energy = np.sqrt(np.mean(audio_data**2))
            zero_crossing_rate = float(np.mean(librosa.feature.zero_crossing_rate(audio_data)[0])) if librosa is not None else 0.0
            
            # Simple voice activity detection
            energy_threshold = 0.01
            voice_activity = np.sum(np.abs(audio_data) > energy_threshold) / len(audio_data)
            
            return {
                "rms_energy": float(rms_energy),
                "zero_crossing_rate": float(zero_crossing_rate),
                "voice_activity_ratio": float(voice_activity),
                "duration": len(audio_data) / sample_rate
            }
            
        except Exception as e:
            logger.error(f"Basic voice characteristics extraction failed: {e}")
            return {}
    
    async def _identify_speaker(self, audio_data: np.ndarray, sample_rate: int) -> Optional[str]:
        """Identify speaker using voice characteristics"""
        try:
            # Placeholder speaker identification
            # In production, this would use a trained speaker recognition model
            
            # Extract voice characteristics
            characteristics = await self._extract_voice_characteristics(audio_data, sample_rate)
            
            # Simple speaker identification based on voice characteristics
            if characteristics.get("voice_activity_ratio", 0) > 0.1:
                return "speaker_001"  # Placeholder speaker ID
            
            return None
            
        except Exception as e:
            logger.error(f"Speaker identification failed: {e}")
            return None
    
    async def _detect_tampering_indicators(self, audio_data: np.ndarray, sample_rate: int) -> List[str]:
        """Detect indicators of audio tampering"""
        try:
            indicators = []
            
            # Check for sudden level changes
            window_size = sample_rate // 10  # 100ms windows
            windows = [audio_data[i:i+window_size] for i in range(0, len(audio_data), window_size)]
            
            if len(windows) > 1:
                levels = [np.sqrt(np.mean(window**2)) for window in windows]
                level_changes = [abs(levels[i] - levels[i-1]) for i in range(1, len(levels))]
                
                if max(level_changes) > 0.5:  # Threshold for sudden changes
                    indicators.append("Sudden level changes detected")
            
            # Check for silence gaps
            silence_threshold = 0.01
            silence_mask = np.abs(audio_data) < silence_threshold
            silence_ratio = np.sum(silence_mask) / len(audio_data)
            
            if silence_ratio > 0.3:
                indicators.append("Excessive silence detected")
            
            # Check for clipping
            clipping_ratio = np.sum(np.abs(audio_data) > 0.95) / len(audio_data)
            if clipping_ratio > 0.05:
                indicators.append("Audio clipping detected")
            
            return indicators
            
        except Exception as e:
            logger.error(f"Tampering detection failed: {e}")
            return []
    
    async def _detect_splicing(self, audio_data: np.ndarray, sample_rate: int) -> List[Dict[str, Any]]:
        """Detect audio splicing points"""
        try:
            splicing_points = []
            
            # Use spectral features to detect splicing
            hop_length = 512
            frame_length = 2048
            
            # Calculate spectral features for each frame
            spectral_centroids = librosa.feature.spectral_centroid(
                y=audio_data, sr=sample_rate, hop_length=hop_length, n_fft=frame_length
            )[0]
            
            # Detect sudden changes in spectral centroid
            centroid_diff = np.diff(spectral_centroids)
            threshold = np.std(centroid_diff) * 3  # 3 standard deviations
            
            splicing_indices = np.where(np.abs(centroid_diff) > threshold)[0]
            
            for idx in splicing_indices:
                time_stamp = idx * hop_length / sample_rate
                splicing_points.append({
                    "timestamp": float(time_stamp),
                    "confidence": float(min(np.abs(centroid_diff[idx]) / threshold, 1.0)),
                    "type": "spectral_discontinuity"
                })
            
            return splicing_points
            
        except Exception as e:
            logger.error(f"Splicing detection failed: {e}")
            return []
    
    async def _get_audio_file_info(self, file_path: str) -> Dict[str, Any]:
        """Get audio file information"""
        try:
            file_path_obj = Path(file_path)
            stat = file_path_obj.stat()
            
            # Try to get audio file info using soundfile
            try:
                info = sf.info(file_path)
                return {
                    "file_size": stat.st_size,
                    "format": info.format,
                    "subtype": info.subtype,
                    "channels": info.channels,
                    "sample_rate": info.samplerate,
                    "frames": info.frames,
                    "duration": info.duration,
                    "bit_depth": getattr(info, 'subtype_info', {}).get('bit_depth', 16)
                }
            except:
                return {
                    "file_size": stat.st_size,
                    "format": file_path_obj.suffix.lower(),
                    "bit_depth": 16,
                    "encoding": "unknown"
                }
                
        except Exception as e:
            logger.error(f"Audio file info extraction failed: {e}")
            return {}
    
    def _calculate_overall_confidence(
        self,
        voice_identification: VoiceIdentificationResult,
        authenticity_analysis: AudioAuthenticityResult,
        technical_analysis: Dict[str, Any]
    ) -> float:
        """Calculate overall analysis confidence"""
        # Weighted average of different analysis components
        weights = {
            "voice": 0.4,
            "authenticity": 0.3,
            "technical": 0.3
        }
        
        confidence = (
            voice_identification.confidence * weights["voice"] +
            authenticity_analysis.confidence * weights["authenticity"] +
            (1.0 if technical_analysis and "error" not in technical_analysis else 0.0) * weights["technical"]
        )
        
        return min(confidence, 1.0)
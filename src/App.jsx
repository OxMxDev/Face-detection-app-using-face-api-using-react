import React, { useRef, useState, useEffect } from "react";
import * as faceapi from "face-api.js";

function App() {
	const [modelsLoaded, setModelsLoaded] = useState(false);
	const [captureVideo, setCaptureVideo] = useState(false);
	const [selectedFilter, setSelectedFilter] = useState("none");
	const [emotionHistory, setEmotionHistory] = useState([]);
	const [showAnalytics, setShowAnalytics] = useState(false);
	const [captureMode, setCaptureMode] = useState("live");
	const [recordingState, setRecordingState] = useState("idle");
	const [recordedChunks, setRecordedChunks] = useState([]);
	const [downloadLink, setDownloadLink] = useState("");
	const [showAvatar, setShowAvatar] = useState(false);
	const [accessibilityMode, setAccessibilityMode] = useState(false);
	const [speakingFeedback, setSpeakingFeedback] = useState(false);
	const speechSynthesisRef = useRef(null);
	const [emotionEffects, setEmotionEffects] = useState(true);
	const [currentEffect, setCurrentEffect] = useState(null);
	const [comparisonMode, setComparisonMode] = useState(false);
	const [referenceFace, setReferenceFace] = useState(null);
	const [faceMatchResults, setFaceMatchResults] = useState(null);
	const effectTimeoutRef = useRef(null);


	const [avatarColors, setAvatarColors] = useState({
		skin: "#f5d0a9",
		hair: "#6b3e26",
		eyes: "#4b2e01",
		mouth: "#c93f3f",
		background: "#87ceeb",
	});
	const videoRef = useRef();
	const canvasRef = useRef();
	const avatarCanvasRef = useRef(); // New ref for avatar canvas
	const intervalRef = useRef();
	const mediaRecorderRef = useRef();
	const avatarIntervalRef = useRef();

	const availableFilters = [
		{ id: "none", name: "No Filter" },
		{ id: "glasses", name: "Cool Glasses" },
		{ id: "hat", name: "Party Hat" },
		{ id: "mustache", name: "Mustache" },
		{ id: "cat", name: "Cat Ears" },
	];
	console.log("Applying filter:", selectedFilter);

	const toggleComparisonMode = () => {
		if (!comparisonMode) {
			// Entering comparison mode - reset data
			setReferenceFace(null);
			setFaceMatchResults(null);
		}
		setComparisonMode(!comparisonMode);
	};

	const captureReferenceFace = async () => {
		if (!videoRef.current || !modelsLoaded) return;

		try {
			const detections = await faceapi
				.detectAllFaces(
					videoRef.current,
					new faceapi.TinyFaceDetectorOptions({
						inputSize: 512,
						scoreThreshold: 0.4,
					})
				)
				.withFaceLandmarks()
				.withFaceDescriptors();

			if (detections.length > 0) {
				// Save first face descriptor as reference
				setReferenceFace({
					descriptor: detections[0].descriptor,
					timestamp: new Date().toLocaleTimeString(),
				});

				// Snapshot of video frame to canvas for visual reference
				const canvas = document.createElement("canvas");
				canvas.width = videoRef.current.videoWidth;
				canvas.height = videoRef.current.videoHeight;
				const ctx = canvas.getContext("2d");
				ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

				// Save image data URL to reference object
				setReferenceFace((prev) => ({
					...prev,
					imageUrl: canvas.toDataURL("image/jpeg"),
				}));
			}
		} catch (error) {
			console.error("Error capturing reference face:", error);
		}
	};

	const compareFaceToReference = (faceDescriptor) => {
		if (!referenceFace || !referenceFace.descriptor) return null;

		// Calculate Euclidean distance between face descriptors
		// Lower distance = more similar (0 = identical, >0.6 = different person typically)
		const distance = faceapi.euclideanDistance(
			faceDescriptor,
			referenceFace.descriptor
		);

		// Calculate similarity score (0-100%)
		const similarity = Math.max(0, Math.min(100, (1 - distance) * 100));

		return {
			distance,
			similarity: similarity.toFixed(1),
			isMatch: distance < 0.6,
		};
	};


	const toggleAccessibilityMode = () => {
		setAccessibilityMode(!accessibilityMode);

		// Stop any ongoing speech when toggling
		if (speechSynthesisRef.current) {
			window.speechSynthesis.cancel();
		}
	};
	const triggerEmotionEffect = (emotion, intensity) => {
		if (!emotionEffects || intensity < 0.7) return; // Only trigger for strong emotions

		// Clear any existing effect timeout
		if (effectTimeoutRef.current) {
			clearTimeout(effectTimeoutRef.current);
		}

		// Set the effect based on emotion
		setCurrentEffect(emotion);

		// Clear effect after 3 seconds
		effectTimeoutRef.current = setTimeout(() => {
			setCurrentEffect(null);
		}, 3000);
	};
	const speakDetectionResults = (detections) => {
		if (!accessibilityMode || speakingFeedback || !detections.length) return;

		const detection = detections[0]; // Use first face detected
		const { age, gender, expressions } = detection;

		// Get dominant emotion
		const emotions = Object.entries(expressions);
		emotions.sort((a, b) => b[1] - a[1]);
		const dominantEmotion = emotions[0][0];

		// Create message
		const message = `Detected ${detections.length} ${
			detections.length === 1 ? "person" : "people"
		}. 
            ${detections.length === 1? `You appear to be around ${Math.round(age)} years old and your dominant emotion is ${dominantEmotion}.`: ""}`;

		// Use speech synthesis to speak the message
		setSpeakingFeedback(true);
		const utterance = new SpeechSynthesisUtterance(message);
		utterance.onend = () => {
			setSpeakingFeedback(false);
		};

		speechSynthesisRef.current = utterance;
		window.speechSynthesis.speak(utterance);
	};
	// Load models on mount
	useEffect(() => {
		const loadModels = async () => {
			const MODEL_URL =
				"https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";
			try {
				console.log("Loading models...");
				await Promise.all([
					faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
					faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
					faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
					faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
					faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
				]);
				setModelsLoaded(true);
				console.log("All models loaded!");
			} catch (error) {
				console.error("Error loading models:", error);
			}
		};

		loadModels();

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
			if (avatarIntervalRef.current) clearInterval(avatarIntervalRef.current);
			stopRecording();
		};
	}, []);
	const generateAvatar = (landmarks, expressions) => {
		if (!avatarCanvasRef.current || !landmarks) return;

		const canvas = avatarCanvasRef.current;
		const ctx = canvas.getContext("2d");
		const width = canvas.width;
		const height = canvas.height;

		// Clear canvas
		ctx.clearRect(0, 0, width, height);

		// Draw background
		ctx.fillStyle = avatarColors.background;
		ctx.fillRect(0, 0, width, height);

		// Extract key points from landmarks
		const jawOutline = landmarks.getJawOutline();
		const nose = landmarks.getNose();
		const mouth = landmarks.getMouth();
		const leftEye = landmarks.getLeftEye();
		const rightEye = landmarks.getRightEye();
		const leftEyebrow = landmarks.getLeftEyeBrow();
		const rightEyebrow = landmarks.getRightEyeBrow();

		// Calculate face center and dimensions for our avatar
		const faceWidth =
			Math.max(...jawOutline.map((pt) => pt.x)) -
			Math.min(...jawOutline.map((pt) => pt.x));
		const faceHeight =
			Math.max(...jawOutline.map((pt) => pt.y)) -
			Math.min(...jawOutline.map((pt) => pt.y));
		const faceTop = Math.min(...jawOutline.map((pt) => pt.y));
		const faceLeft = Math.min(...jawOutline.map((pt) => pt.x));

		// Scale and position for our canvas
		const scale = Math.min(
			(width / faceWidth) * 0.8,
			(height / faceHeight) * 0.8
		);
		const offsetX = (width - faceWidth * scale) / 2;
		const offsetY = (height - faceHeight * scale) / 2;

		// Draw face shape
		ctx.beginPath();
		ctx.moveTo(
			offsetX + (jawOutline[0].x - faceLeft) * scale,
			offsetY + (jawOutline[0].y - faceTop) * scale
		);

		// Draw smoothed face outline
		for (let i = 1; i < jawOutline.length; i += 2) {
			const cp1x = offsetX + (jawOutline[i].x - faceLeft) * scale;
			const cp1y = offsetY + (jawOutline[i].y - faceTop) * scale;
			const cp2x =
				i < jawOutline.length - 1
					? offsetX + (jawOutline[i + 1].x - faceLeft) * scale
					: offsetX + (jawOutline[0].x - faceLeft) * scale;
			const cp2y =
				i < jawOutline.length - 1
					? offsetY + (jawOutline[i + 1].y - faceTop) * scale
					: offsetY + (jawOutline[0].y - faceTop) * scale;
			const x =
				i < jawOutline.length - 2
					? offsetX + (jawOutline[i + 2].x - faceLeft) * scale
					: offsetX + (jawOutline[0].x - faceLeft) * scale;
			const y =
				i < jawOutline.length - 2
					? offsetY + (jawOutline[i + 2].y - faceTop) * scale
					: offsetY + (jawOutline[0].y - faceTop) * scale;

			ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
		}

		ctx.closePath();
		ctx.fillStyle = avatarColors.skin;
		ctx.fill();
		ctx.strokeStyle = "#000000";
		ctx.lineWidth = 2;
		ctx.stroke();

		// Draw eyes
		const drawEye = (eyePoints, expressionValue) => {
			const eyeCenterX =
				eyePoints.reduce((sum, pt) => sum + pt.x, 0) / eyePoints.length;
			const eyeCenterY =
				eyePoints.reduce((sum, pt) => sum + pt.y, 0) / eyePoints.length;
			const eyeWidth =
				Math.max(...eyePoints.map((pt) => pt.x)) -
				Math.min(...eyePoints.map((pt) => pt.x));

			// Transform to canvas coordinates
			const x = offsetX + (eyeCenterX - faceLeft) * scale;
			const y = offsetY + (eyeCenterY - faceTop) * scale;
			const size = eyeWidth * scale * 0.8;

			// Eye white
			ctx.beginPath();
			ctx.ellipse(x, y, size, size * 0.6, 0, 0, Math.PI * 2);
			ctx.fillStyle = "#ffffff";
			ctx.fill();
			ctx.stroke();

			// Eye pupil - size depends on surprise/fear expressions
			const pupilSizeFactor =
				0.5 - Math.max(expressions.surprised, expressions.fearful) * 0.3;
			ctx.beginPath();
			ctx.ellipse(
				x,
				y,
				size * pupilSizeFactor,
				size * pupilSizeFactor,
				0,
				0,
				Math.PI * 2
			);
			ctx.fillStyle = avatarColors.eyes;
			ctx.fill();

			// Catch light
			ctx.beginPath();
			ctx.ellipse(
				x - size * 0.3,
				y - size * 0.2,
				size * 0.15,
				size * 0.15,
				0,
				0,
				Math.PI * 2
			);
			ctx.fillStyle = "#ffffff";
			ctx.fill();
		};

		drawEye(leftEye, expressions);
		drawEye(rightEye, expressions);

		// Draw eyebrows - position depends on expression (surprised, angry)
		const drawEyebrow = (eyebrowPoints, isAngry, isSurprised) => {
			const offset = isAngry ? -10 * scale : isSurprised ? 15 * scale : 0;

			ctx.beginPath();
			ctx.moveTo(
				offsetX + (eyebrowPoints[0].x - faceLeft) * scale,
				offsetY + (eyebrowPoints[0].y - faceTop) * scale + offset
			);

			for (let i = 1; i < eyebrowPoints.length; i++) {
				const angleOffset = isAngry
					? (i - eyebrowPoints.length / 2) * 5 * scale
					: 0;

				ctx.lineTo(
					offsetX + (eyebrowPoints[i].x - faceLeft) * scale,
					offsetY +
						(eyebrowPoints[i].y - faceTop) * scale +
						offset +
						angleOffset
				);
			}

			ctx.lineWidth = 3 * scale;
			ctx.strokeStyle = avatarColors.hair;
			ctx.stroke();
		};

		drawEyebrow(
			leftEyebrow,
			expressions.angry > 0.5,
			expressions.surprised > 0.5
		);
		drawEyebrow(
			rightEyebrow,
			expressions.angry > 0.5,
			expressions.surprised > 0.5
		);

		// Draw nose
		ctx.beginPath();
		const noseBaseX = offsetX + (nose[nose.length - 1].x - faceLeft) * scale;
		const noseBaseY = offsetY + (nose[nose.length - 1].y - faceTop) * scale;
		const noseTipX =
			offsetX + (nose[Math.floor(nose.length / 2)].x - faceLeft) * scale;
		const noseTipY =
			offsetY + (nose[Math.floor(nose.length / 2)].y - faceTop) * scale;

		ctx.moveTo(noseTipX - 15 * scale, noseTipY);
		ctx.quadraticCurveTo(
			noseTipX,
			noseTipY + 10 * scale,
			noseTipX + 15 * scale,
			noseTipY
		);

		ctx.moveTo(noseTipX, noseTipY);
		ctx.lineTo(noseTipX, noseBaseY);

		ctx.strokeStyle = "#000000";
		ctx.lineWidth = 2 * scale;
		ctx.stroke();

		// Draw mouth - shape depends on expression
		const mouthCenterX =
			mouth.reduce((sum, pt) => sum + pt.x, 0) / mouth.length;
		const mouthCenterY =
			mouth.reduce((sum, pt) => sum + pt.y, 0) / mouth.length;
		const mouthWidth =
			Math.max(...mouth.map((pt) => pt.x)) -
			Math.min(...mouth.map((pt) => pt.x));
		const mouthHeight =
			Math.max(...mouth.map((pt) => pt.y)) -
			Math.min(...mouth.map((pt) => pt.y));

		const mouthX = offsetX + (mouthCenterX - faceLeft) * scale;
		const mouthY = offsetY + (mouthCenterY - faceTop) * scale;

		ctx.beginPath();

		// Smile curve based on happiness vs sadness
		const smileFactor = expressions.happy - expressions.sad;
		const mouthHeightFactor = expressions.surprised * 0.8 + 0.2;

		ctx.ellipse(
			mouthX,
			mouthY,
			mouthWidth * scale * 0.5,
			mouthHeight * scale * mouthHeightFactor,
			0,
			0,
			Math.PI * 2
		);

		if (expressions.happy > 0.5) {
			// Big smile
			ctx.moveTo(mouthX - mouthWidth * scale * 0.5, mouthY);
			ctx.bezierCurveTo(
				mouthX - mouthWidth * scale * 0.25,
				mouthY + mouthHeight * scale * 0.5,
				mouthX + mouthWidth * scale * 0.25,
				mouthY + mouthHeight * scale * 0.5,
				mouthX + mouthWidth * scale * 0.5,
				mouthY
			);
			ctx.lineTo(mouthX - mouthWidth * scale * 0.5, mouthY);
			ctx.fillStyle = avatarColors.mouth;
			ctx.fill();
		} else if (expressions.surprised > 0.5) {
			// O shaped mouth
			ctx.fillStyle = avatarColors.mouth;
			ctx.fill();
		} else {
			// Default mouth
			ctx.moveTo(mouthX - mouthWidth * scale * 0.5, mouthY);
			ctx.bezierCurveTo(
				mouthX - mouthWidth * scale * 0.25,
				mouthY + smileFactor * mouthHeight * scale * 0.5,
				mouthX + mouthWidth * scale * 0.25,
				mouthY + smileFactor * mouthHeight * scale * 0.5,
				mouthX + mouthWidth * scale * 0.5,
				mouthY
			);
			ctx.strokeStyle = avatarColors.mouth;
			ctx.lineWidth = 3 * scale;
			ctx.stroke();
		}

		// Draw hair
		ctx.beginPath();
		const hairBaseY = Math.min(
			...leftEyebrow.map((pt) => pt.y),
			...rightEyebrow.map((pt) => pt.y)
		);
		const hairY = offsetY + (hairBaseY - faceTop - 30) * scale;

		// Hairstyle based on gender probability and mood
		ctx.moveTo(
			offsetX + (jawOutline[0].x - faceLeft - 20) * scale,
			offsetY + (jawOutline[0].y - faceTop) * scale
		);
		ctx.lineTo(offsetX + (jawOutline[0].x - faceLeft - 20) * scale, hairY);
		ctx.bezierCurveTo(
			offsetX + (jawOutline[0].x - faceLeft) * scale,
			hairY - 40 * scale,
			offsetX + (jawOutline[jawOutline.length - 1].x - faceLeft) * scale,
			hairY - 40 * scale,
			offsetX + (jawOutline[jawOutline.length - 1].x - faceLeft + 20) * scale,
			hairY
		);
		ctx.lineTo(
			offsetX + (jawOutline[jawOutline.length - 1].x - faceLeft + 20) * scale,
			offsetY + (jawOutline[jawOutline.length - 1].y - faceTop) * scale
		);

		ctx.fillStyle = avatarColors.hair;
		ctx.fill();
	};

	// Create a function to start the avatar generation
	const startAvatarGeneration = async () => {
		if (!videoRef.current || !modelsLoaded) return;

		setShowAvatar(true);

		// Make sure avatar canvas is the right size
		if (avatarCanvasRef.current) {
			avatarCanvasRef.current.width = 300;
			avatarCanvasRef.current.height = 300;
		}

		// Clear any existing avatar interval
		if (avatarIntervalRef.current) {
			clearInterval(avatarIntervalRef.current);
		}

		// Create interval to update avatar
		avatarIntervalRef.current = setInterval(async () => {
			if (videoRef.current && videoRef.current.readyState === 4) {
				try {
					const detections = await faceapi
						.detectAllFaces(
							videoRef.current,
							new faceapi.TinyFaceDetectorOptions({
								inputSize: 512,
								scoreThreshold: 0.4,
							})
						)
						.withFaceLandmarks()
						.withFaceExpressions();

					if (detections.length > 0) {
						// Use the first detected face for the avatar
						generateAvatar(detections[0].landmarks, detections[0].expressions);
					}
				} catch (error) {
					console.error("Error generating avatar:", error);
				}
			}
		}, 100);
	};

	// Stop avatar generation
	const stopAvatarGeneration = () => {
		if (avatarIntervalRef.current) {
			clearInterval(avatarIntervalRef.current);
			avatarIntervalRef.current = null;
		}
		setShowAvatar(false);
	};

	// Add this function to generate random avatar colors
	const randomizeAvatarColors = () => {
		const randomColor = () => {
			const letters = "0123456789ABCDEF";
			let color = "#";
			for (let i = 0; i < 6; i++) {
				color += letters[Math.floor(Math.random() * 16)];
			}
			return color;
		};

		setAvatarColors({
			skin: randomColor(),
			hair: randomColor(),
			eyes: randomColor(),
			mouth: randomColor(),
			background: randomColor(),
		});
	};
	const startVideo = () => {
		if (!modelsLoaded) {
			console.warn("Models not loaded yet");
			return;
		}
		setCaptureVideo(true);
		navigator.mediaDevices
			.getUserMedia({ video: true })
			.then((stream) => {
				videoRef.current.srcObject = stream;
			})
			.catch((err) => console.error("Error accessing camera:", err));
	};

	const stopVideo = () => {
		if (videoRef.current && videoRef.current.srcObject) {
			videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
			videoRef.current.srcObject = null;
			setCaptureVideo(false);

			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}

			if (canvasRef.current) {
				const ctx = canvasRef.current.getContext("2d");
				ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
			}

			stopRecording();
		}
	};

	// Function to apply the selected filter
	const applyFilter = (ctx, detection, filter) => {
		const { x, y, width, height } = detection.detection.box;

		switch (filter) {
			case "glasses":
				// Draw cool glasses
				ctx.beginPath();
				ctx.moveTo(x + width * 0.25, y + width * 0.3);
				ctx.lineTo(x + width * 0.75, y + width * 0.3);
				ctx.strokeStyle = "blue";
				ctx.lineWidth = 4;
				ctx.stroke();
				ctx.closePath();

				// Draw the frame
				ctx.beginPath();
				ctx.arc(
					x + width * 0.35,
					y + width * 0.3,
					width * 0.15,
					0,
					Math.PI * 2
				);
				ctx.strokeStyle = "blue";
				ctx.lineWidth = 2;
				ctx.stroke();
				ctx.closePath();

				ctx.beginPath();
				ctx.arc(
					x + width * 0.65,
					y + width * 0.3,
					width * 0.15,
					0,
					Math.PI * 2
				);
				ctx.strokeStyle = "blue";
				ctx.lineWidth = 2;
				ctx.stroke();
				ctx.closePath();
				break;

			case "hat":
				// Draw party hat
				ctx.beginPath();
				ctx.moveTo(x + width * 0.5, y - height * 0.3);
				ctx.lineTo(x + width * 0.2, y);
				ctx.lineTo(x + width * 0.8, y);
				ctx.closePath();
				ctx.fillStyle = "magenta";
				ctx.fill();
				ctx.strokeStyle = "yellow";
				ctx.lineWidth = 2;
				ctx.stroke();

				// Add hat decoration
				ctx.beginPath();
				ctx.arc(
					x + width * 0.5,
					y - height * 0.15,
					width * 0.05,
					0,
					Math.PI * 2
				);
				ctx.fillStyle = "yellow";
				ctx.fill();
				break;

			case "mustache":
				// Draw mustache based on mouth position
				const mouth = detection.landmarks.getMouth();
				const mouthX = mouth[0].x;
				const mouthY = mouth[0].y;
				const mouthWidth = mouth[6].x - mouth[0].x;

				ctx.beginPath();
				ctx.moveTo(mouthX - mouthWidth * 0.1, mouthY - height * 0.05);
				ctx.bezierCurveTo(
					mouthX + mouthWidth * 0.3,
					mouthY - height * 0.02,
					mouthX + mouthWidth * 0.7,
					mouthY - height * 0.02,
					mouthX + mouthWidth * 1.1,
					mouthY - height * 0.05
				);
				ctx.bezierCurveTo(
					mouthX + mouthWidth * 0.7,
					mouthY + height * 0.02,
					mouthX + mouthWidth * 0.3,
					mouthY + height * 0.02,
					mouthX - mouthWidth * 0.1,
					mouthY - height * 0.05
				);
				ctx.fillStyle = "black";
				ctx.fill();
				break;

			case "cat":
				// Draw cat ears
				// Left ear
				ctx.beginPath();
				ctx.moveTo(x + width * 0.25, y);
				ctx.lineTo(x + width * 0.1, y - height * 0.2);
				ctx.lineTo(x + width * 0.3, y - height * 0.05);
				ctx.closePath();
				ctx.fillStyle = "orange";
				ctx.fill();

				// Right ear
				ctx.beginPath();
				ctx.moveTo(x + width * 0.75, y);
				ctx.lineTo(x + width * 0.9, y - height * 0.2);
				ctx.lineTo(x + width * 0.7, y - height * 0.05);
				ctx.closePath();
				ctx.fillStyle = "orange";
				ctx.fill();

				// Whiskers
				const nose = detection.landmarks.getNose();
				const noseX = nose[0].x;
				const noseY = nose[0].y;

				// Left whiskers
				ctx.beginPath();
				ctx.moveTo(noseX, noseY);
				ctx.lineTo(noseX - width * 0.2, noseY - height * 0.05);
				ctx.moveTo(noseX, noseY);
				ctx.lineTo(noseX - width * 0.2, noseY);
				ctx.moveTo(noseX, noseY);
				ctx.lineTo(noseX - width * 0.2, noseY + height * 0.05);
				ctx.strokeStyle = "black";
				ctx.lineWidth = 1;
				ctx.stroke();

				// Right whiskers
				ctx.beginPath();
				ctx.moveTo(noseX, noseY);
				ctx.lineTo(noseX + width * 0.2, noseY - height * 0.05);
				ctx.moveTo(noseX, noseY);
				ctx.lineTo(noseX + width * 0.2, noseY);
				ctx.moveTo(noseX, noseY);
				ctx.lineTo(noseX + width * 0.2, noseY + height * 0.05);
				ctx.strokeStyle = "black";
				ctx.lineWidth = 1;
				ctx.stroke();
				break;

			default:
				break;
		}
	};

	const renderEmotionEffect = () => {
		if (!currentEffect) return null;

		const effectStyles = {
			position: "fixed",
			top: 0,
			left: 0,
			right: 0,
			bottom: 0,
			pointerEvents: "none",
			zIndex: 100,
		};

		switch (currentEffect) {
			case "happy":
				return (
					<div
						style={{
							...effectStyles,
							background:
								"radial-gradient(circle, rgba(255,215,0,0.2) 0%, rgba(255,255,255,0) 70%)",
							animation: "pulse 1.5s infinite",
						}}
					>
						<style>{`
            @keyframes pulse {
              0% { opacity: 0.3; }
              50% { opacity: 0.7; }
              100% { opacity: 0.3; }
            }
            @keyframes float {
              0% { transform: translateY(0px); }
              50% { transform: translateY(-20px); }
              100% { transform: translateY(0px); }
            }
          `}</style>
						{[...Array(15)].map((_, i) => (
							<div
								key={i}
								style={{
									position: "absolute",
									fontSize: `${Math.random() * 30 + 20}px`,
									left: `${Math.random() * 100}%`,
									top: `${Math.random() * 100}%`,
									animation: `float ${
										Math.random() * 3 + 2
									}s infinite ease-in-out`,
								}}
							>
								😊
							</div>
						))}
					</div>
				);
			case "surprised":
				return (
					<div
						style={{
							...effectStyles,
							animation: "shake 0.5s",
						}}
					>
						<style>{`
            @keyframes shake {
              0% { transform: translate(0, 0) rotate(0deg); }
              25% { transform: translate(10px, 10px) rotate(5deg); }
              50% { transform: translate(0, 0) rotate(0eg); }
              75% { transform: translate(-10px, 10px) rotate(-5deg); }
              100% { transform: translate(0, 0) rotate(0deg); }
            }
          `}</style>
						{[...Array(20)].map((_, i) => (
							<div
								key={i}
								style={{
									position: "absolute",
									fontSize: `${Math.random() * 40 + 20}px`,
									left: `${Math.random() * 100}%`,
									top: `${Math.random() * 100}%`,
									opacity: 0.7,
								}}
							>
								⭐
							</div>
						))}
					</div>
				);
			case "angry":
				return (
					<div
						style={{
							...effectStyles,
							backdropFilter: "sepia(0.5)",
							background:
								"radial-gradient(circle, rgba(255,0,0,0.15) 0%, rgba(255,0,0,0) 70%)",
						}}
					>
						{[...Array(10)].map((_, i) => (
							<div
								key={i}
								style={{
									position: "absolute",
									fontSize: `${Math.random() * 30 + 20}px`,
									left: `${Math.random() * 100}%`,
									top: `${Math.random() * 100}%`,
									animation: "float 3s infinite",
								}}
							>
								💢
							</div>
						))}
					</div>
				);
			default:
				return null;
		}
	};
	// Function to track and update emotion history
	const updateEmotionHistory = (expressions) => {
		// Find the dominant emotion
		const emotions = Object.entries(expressions);
		emotions.sort((a, b) => b[1] - a[1]);
		const dominantEmotion = emotions[0][0];
		const timestamp = new Date().toLocaleTimeString();

		setEmotionHistory((prev) => {
			// Keep only the last 10 entries
			const newHistory = [
				...prev,
				{ emotion: dominantEmotion, timestamp, value: emotions[0][1] },
			];
			if (newHistory.length > 10) {
				return newHistory.slice(newHistory.length - 10);
			}
			return newHistory;
		});
	};

	// Function to generate emotion-based messages
	const getEmotionMessage = (expression) => {
		const emotions = Object.entries(expression);
		emotions.sort((a, b) => b[1] - a[1]);
		const topEmotion = emotions[0];

		switch (topEmotion[0]) {
			case "happy":
				return "Your smile brightens up the room! 😊";
			case "sad":
				return "Hang in there! Better days are coming. 🌈";
			case "angry":
				return "Take a deep breath, it's going to be okay. 🧘‍♂️";
			case "surprised":
				return "Wow! What caught your attention? 😲";
			case "fearful":
				return "You're brave, don't worry! 🦁";
			case "disgusted":
				return "That's quite a reaction! 😖";
			case "neutral":
				return "Looking calm and collected! 😌";
			default:
				return "";
		}
	};

	// Screenshot function
	const takeScreenshot = () => {
		const canvas = canvasRef.current;
		if (canvas) {
			const imageUrl = canvas.toDataURL("image/png");
			const link = document.createElement("a");
			link.href = imageUrl;
			link.download = `face-detection-${new Date().toISOString()}.png`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		}
	};

	// Recording functions
	const startRecording = () => {
		if (!videoRef.current?.srcObject) return;

		const stream = videoRef.current.srcObject;
		const mediaRecorder = new MediaRecorder(stream);

		mediaRecorderRef.current = mediaRecorder;
		setRecordedChunks([]);
		setRecordingState("recording");

		mediaRecorder.ondataavailable = (e) => {
			if (e.data.size > 0) {
				setRecordedChunks((prev) => [...prev, e.data]);
			}
		};

		mediaRecorder.onstop = () => {
			setRecordingState("processing");

			const blob = new Blob(recordedChunks, {
				type: "video/webm",
			});

			const url = URL.createObjectURL(blob);
			setDownloadLink(url);
			setRecordingState("idle");
		};

		// Start recording
		mediaRecorder.start();
	};

	const stopRecording = () => {
		if (mediaRecorderRef.current && recordingState === "recording") {
			mediaRecorderRef.current.stop();
		}
	};

	const handleVideoPlay = () => {
		canvasRef.current.width = videoRef.current.videoWidth;
		canvasRef.current.height = videoRef.current.videoHeight;

		if (intervalRef.current) clearInterval(intervalRef.current);

		intervalRef.current = setInterval(async () => {
			if (videoRef.current.readyState === 4) {
				const videoWidth = videoRef.current.videoWidth;
				const videoHeight = videoRef.current.videoHeight;

				canvasRef.current.width = videoWidth;
				canvasRef.current.height = videoHeight;

				const detections = await faceapi
					.detectAllFaces(
						videoRef.current,
						new faceapi.TinyFaceDetectorOptions({
							inputSize: 512,
							scoreThreshold: 0.4,
						})
					)
					.withFaceLandmarks()
					.withFaceExpressions()
					.withAgeAndGender();

				const ctx = canvasRef.current.getContext("2d");
				ctx.clearRect(0, 0, videoWidth, videoHeight);

				ctx.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight);

				// Draw detections
				faceapi.draw.drawDetections(canvasRef.current, detections);
				faceapi.draw.drawFaceLandmarks(canvasRef.current, detections);

				detections.forEach((detection) => {
					const { age, gender, genderProbability, expressions } = detection;
					const { x, y, width } = detection.detection.box;

					// Apply selected filter
					if (selectedFilter !== "none" && detection.landmarks) {
						applyFilter(ctx, detection, selectedFilter);
					}

					// Age & Gender
					const roundedAge = Math.round(age);
					ctx.fillStyle = "yellow";
					ctx.font = "16px Arial";
					ctx.fillText(
						`Age: ${roundedAge} | ${gender} (${(
							genderProbability * 100
						).toFixed(0)}%)`,
						x,
						y - 10
					);

					// Expression detection
					const emotions = Object.entries(expressions);
					emotions.sort((a, b) => b[1] - a[1]);
					const topEmotion = emotions[0];
					ctx.fillText(`Emotion: ${topEmotion[0]}`, x, y + width + 20);

					updateEmotionHistory(expressions);

					// Emotion message
					if (topEmotion[1] > 0.5) {
						const message = getEmotionMessage(expressions);
						ctx.fillStyle = "lime";
						ctx.font = "bold 18px Arial";
						ctx.fillText(message, x, y + width + 50);
					}

					// Trigger visual emotion effect
					Object.entries(expressions).forEach(([emotion, value]) => {
						if (value > 0.7) {
							triggerEmotionEffect(emotion, value);
						}
					});
				});

				// ✅ INSERTED FACE COMPARISON CODE HERE
				if (comparisonMode && referenceFace) {
					try {
						const fullDetections = await faceapi
							.detectAllFaces(
								videoRef.current,
								new faceapi.TinyFaceDetectorOptions()
							)
							.withFaceLandmarks()
							.withFaceDescriptors();

						if (fullDetections.length > 0) {
							const matchResults = compareFaceToReference(
								fullDetections[0].descriptor
							);
							setFaceMatchResults(matchResults);

							if (matchResults) {
								const { x, y, width } = fullDetections[0].detection.box;
								ctx.fillStyle = matchResults.isMatch
									? "rgba(0, 255, 0, 0.5)"
									: "rgba(255, 0, 0, 0.5)";
								ctx.fillRect(x, y - 30, width, 30);
								ctx.fillStyle = "white";
								ctx.font = "16px Arial";
								ctx.fillText(
									`Match: ${matchResults.similarity}%`,
									x + 5,
									y - 10
								);
							}
						}
					} catch (error) {
						console.error("Error comparing faces:", error);
					}
				}
				// ✅ END OF INSERT

				// Accessibility speaking feedback
				if (accessibilityMode) {
					if (Math.floor(Date.now() / 5000) % 2 === 0) {
						speakDetectionResults(detections);
					}
				}

				console.log("Faces detected:", detections.length);
			}
		}, 100);
	};

	// Function to render emotion analytics
	const renderEmotionAnalytics = () => {
		if (emotionHistory.length === 0)
			return <p>No emotion data collected yet</p>;

		// Count occurrences of each emotion
		const emotionCounts = emotionHistory.reduce((acc, entry) => {
			acc[entry.emotion] = (acc[entry.emotion] || 0) + 1;
			return acc;
		}, {});

		// Find most frequent emotion
		let mostFrequentEmotion = "";
		let maxCount = 0;

		Object.entries(emotionCounts).forEach(([emotion, count]) => {
			if (count > maxCount) {
				mostFrequentEmotion = emotion;
				maxCount = count;
			}
		});

		const emotionColors = {
			happy: "#FFD700",
			sad: "#6495ED",
			angry: "#FF6347",
			surprised: "#DA70D6",
			fearful: "#9370DB",
			disgusted: "#32CD32",
			neutral: "#C0C0C0",
		};

		return (
			<div
				style={{
					marginTop: "20px",
					background: "#1e293b",
					padding: "15px",
					borderRadius: "10px",
				}}
			>
				<h3>Emotion Analytics</h3>
				<p>
					Most frequent emotion:{" "}
					<strong style={{ color: emotionColors[mostFrequentEmotion] }}>
						{mostFrequentEmotion}
					</strong>
				</p>

				<div style={{ display: "flex", overflowX: "auto", marginTop: "10px" }}>
					{emotionHistory.map((entry, index) => (
						<div
							key={index}
							style={{
								margin: "0 5px",
								textAlign: "center",
								minWidth: "60px",
							}}
						>
							<div
								style={{
									height: `${entry.value * 100}px`,
									width: "20px",
									background: emotionColors[entry.emotion] || "#999",
									margin: "0 auto",
									borderRadius: "3px",
								}}
							/>
							<div style={{ fontSize: "10px", marginTop: "5px" }}>
								{entry.emotion}
							</div>
							<div style={{ fontSize: "8px" }}>{entry.timestamp}</div>
						</div>
					))}
				</div>
			</div>
		);
	};

	return (
		<div
			className="app-container"
			style={{
				textAlign: "center",
				padding: "20px",
				background: "#0f172a",
				minHeight: "100vh",
				color: "#f1f5f9",
			}}
		>
			<h1 style={{ fontSize: "2rem", marginBottom: "20px" }}>
				🧠 AI Face Detection App
			</h1>

			{modelsLoaded ? (
				<div style={{ marginBottom: "20px" }}>
					{!captureVideo ? (
						<button onClick={startVideo} style={buttonStyle}>
							Start Camera
						</button>
					) : (
						<div>
							<button
								onClick={stopVideo}
								style={{ ...buttonStyle, backgroundColor: "#ef4444" }}
							>
								Stop Camera
							</button>

							<div style={{ margin: "20px 0" }}>
								<div style={{ marginBottom: "10px" }}>Select Filter:</div>
								<div
									style={{
										display: "flex",
										justifyContent: "center",
										flexWrap: "wrap",
										gap: "10px",
									}}
								>
									{availableFilters.map((filter) => (
										<button
											key={filter.id}
											onClick={() => setSelectedFilter(filter.id)}
											style={{
												...buttonStyle,
												backgroundColor:
													selectedFilter === filter.id ? "#8b5cf6" : "#3b82f6",
												padding: "8px 15px",
												fontSize: "14px",
											}}
										>
											{filter.name}
										</button>
									))}
								</div>
							</div>

							{/* Add avatar generation buttons */}
							<div style={{ margin: "20px 0" }}>
								<div style={{ marginBottom: "10px" }}>
									AI Avatar Generation:
								</div>
								<div
									style={{
										display: "flex",
										justifyContent: "center",
										gap: "10px",
									}}
								>
									{!showAvatar ? (
										<button
											onClick={startAvatarGeneration}
											style={{ ...buttonStyle, backgroundColor: "#14b8a6" }}
										>
											🤖 Generate Avatar
										</button>
									) : (
										<button
											onClick={stopAvatarGeneration}
											style={{ ...buttonStyle, backgroundColor: "#64748b" }}
										>
											Hide Avatar
										</button>
									)}

									{showAvatar && (
										<button
											onClick={randomizeAvatarColors}
											style={{ ...buttonStyle, backgroundColor: "#d946ef" }}
										>
											🎨 Randomize Colors
										</button>
									)}
								</div>
							</div>

							<div style={{ margin: "20px 0" }}>
								<div style={{ marginBottom: "10px" }}>Capture Options:</div>
								<div
									style={{
										display: "flex",
										justifyContent: "center",
										gap: "10px",
									}}
								>
									<button
										onClick={takeScreenshot}
										style={{ ...buttonStyle, backgroundColor: "#10b981" }}
									>
										📸 Take Screenshot
									</button>

									{recordingState === "idle" ? (
										<button
											onClick={startRecording}
											style={{ ...buttonStyle, backgroundColor: "#f43f5e" }}
										>
											🎥 Start Recording
										</button>
									) : recordingState === "recording" ? (
										<button
											onClick={stopRecording}
											style={{ ...buttonStyle, backgroundColor: "#64748b" }}
										>
											⏹️ Stop Recording
										</button>
									) : (
										<button
											disabled
											style={{
												...buttonStyle,
												backgroundColor: "#64748b",
												opacity: 0.7,
											}}
										>
											Processing...
										</button>
									)}
								</div>
							</div>
							<div style={{ margin: "20px 0" }}>
								<div style={{ marginBottom: "10px" }}>Capture Options:</div>
								<div
									style={{
										display: "flex",
										justifyContent: "center",
										gap: "10px",
									}}
								>
									{/* Screenshot and Recording buttons */}
									<button>📸 Take Screenshot</button>
									<button>🎥 Start/Stop Recording</button>
								</div>
							</div>

							{/* ✅ ADD YOUR NEW TOGGLE BUTTONS HERE */}
							<div style={{ margin: "20px 0" }}>
								<button
									onClick={toggleAccessibilityMode}
									style={{
										...buttonStyle,
										backgroundColor: accessibilityMode ? "#22c55e" : "#64748b",
									}}
								>
									{accessibilityMode
										? "🔊 Disable Voice Feedback"
										: "🔇 Enable Voice Feedback"}
								</button>

								<button
									onClick={() => setEmotionEffects(!emotionEffects)}
									style={{
										...buttonStyle,
										backgroundColor: emotionEffects ? "#8b5cf6" : "#64748b",
									}}
								>
									{emotionEffects
										? "✨ Disable Emotion Effects"
										: "🔍 Enable Emotion Effects"}
								</button>
							</div>

							{downloadLink && (
								<div style={{ margin: "10px 0" }}>
									<a
										href={downloadLink}
										download={`face-detection-${new Date().toISOString()}.webm`}
										style={{
											...buttonStyle,
											backgroundColor: "#22c55e",
											textDecoration: "none",
											display: "inline-block",
										}}
									>
										📥 Download Recording
									</a>
								</div>
							)}

							<div style={{ margin: "20px 0" }}>
								<button
									onClick={() => setShowAnalytics(!showAnalytics)}
									style={{ ...buttonStyle, backgroundColor: "#9333ea" }}
								>
									{showAnalytics
										? "Hide Emotion Analytics"
										: "Show Emotion Analytics"}
								</button>
							</div>
							{captureVideo && (
								<div style={{ margin: "20px 0" }}>
									<button
										onClick={toggleComparisonMode}
										style={{
											...buttonStyle,
											backgroundColor: comparisonMode ? "#f97316" : "#64748b",
										}}
									>
										{comparisonMode
											? "❌ Exit Face Comparison"
											: "👥 Face Comparison Mode"}
									</button>

									{comparisonMode && (
										<div style={{ marginTop: "10px" }}>
											{!referenceFace ? (
												<button
													onClick={captureReferenceFace}
													style={{ ...buttonStyle, backgroundColor: "#0ea5e9" }}
												>
													📸 Capture Reference Face
												</button>
											) : (
												<div>
													<div
														style={{
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															gap: "20px",
															marginTop: "10px",
															background: "#1e293b",
															padding: "15px",
															borderRadius: "10px",
														}}
													>
														<div>
															<h4>Reference Face</h4>
															<p>Captured at: {referenceFace.timestamp}</p>
															{referenceFace.imageUrl && (
																<img
																	src={referenceFace.imageUrl}
																	alt="Reference face"
																	style={{
																		width: "150px",
																		height: "auto",
																		borderRadius: "10px",
																		border: "2px solid #3b82f6",
																	}}
																/>
															)}
														</div>

														{faceMatchResults && (
															<div
																style={{
																	padding: "15px",
																	background: faceMatchResults.isMatch
																		? "rgba(34, 197, 94, 0.2)"
																		: "rgba(239, 68, 68, 0.2)",
																	borderRadius: "10px",
																	textAlign: "center",
																}}
															>
																<h4>Match Results</h4>
																<div
																	style={{
																		fontSize: "24px",
																		fontWeight: "bold",
																	}}
																>
																	{faceMatchResults.similarity}%
																</div>
																<div>
																	{faceMatchResults.isMatch
																		? "✅ MATCH"
																		: "❌ NO MATCH"}
																</div>
															</div>
														)}
													</div>

													<button
														onClick={() => setReferenceFace(null)}
														style={{
															...buttonStyle,
															backgroundColor: "#6b7280",
															marginTop: "10px",
														}}
													>
														🔄 Reset Reference Face
													</button>
												</div>
											)}
										</div>
									)}
								</div>
							)}
							{currentEffect && renderEmotionEffect()}          
						</div>
					)}
				</div>
			) : (
				<p>Loading models... Please wait 🧠</p>
			)}

			{/* Main container for video and avatar side by side */}
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					flexWrap: "wrap",
					gap: "20px",
				}}
			>
				{/* Video container */}
				<div
					className="video-container"
					style={{ position: "relative", display: "inline-block" }}
				>
					{captureVideo && (
						<>
							<video
								ref={videoRef}
								autoPlay
								muted
								onPlay={handleVideoPlay}
								style={{
									borderRadius: "10px",
									width: "100%",
									maxWidth: "600px",
									boxShadow: "0px 0px 20px #3b82f6",
								}}
							/>
							<canvas
								ref={canvasRef}
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									borderRadius: "10px",
									width: "100%",
									maxWidth: "600px",
								}}
							/>
						</>
					)}
				</div>

				{/* Avatar container */}
				{showAvatar && (
					<div
						className="avatar-container"
						style={{
							display: "inline-block",
							background: "#1e293b",
							padding: "15px",
							borderRadius: "10px",
							boxShadow: "0px 0px 20px #8b5cf6",
						}}
					>
						<h3>AI Generated Avatar</h3>
						<p style={{ fontSize: "14px", marginBottom: "10px" }}>
							Real-time cartoon avatar generated from facial landmarks and
							expressions
						</p>
						<canvas
							ref={avatarCanvasRef}
							width={300}
							height={300}
							style={{
								borderRadius: "10px",
								background: "#ffffff",
								boxShadow: "0px 0px 10px rgba(0,0,0,0.2)",
							}}
						/>
					</div>
				)}
			</div>

			{showAnalytics && renderEmotionAnalytics()}
		</div>
	);
}

const buttonStyle = {
	padding: "10px 20px",
	backgroundColor: "#3b82f6",
	color: "#fff",
	fontSize: "16px",
	borderRadius: "10px",
	border: "none",
	cursor: "pointer",
	margin: "0 5px",
	transition: "background 0.3s ease",
};

export default App;

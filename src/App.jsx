import React, { useRef, useState, useEffect } from "react";
import * as faceapi from "face-api.js";

function App() {
	const [modelsLoaded, setModelsLoaded] = useState(false);
	const [captureVideo, setCaptureVideo] = useState(false);

	const videoRef = useRef();
	const canvasRef = useRef();
	const intervalRef = useRef();

	// Load models on component mount
	useEffect(() => {
		const loadModels = async () => {
			// Load models from GitHub directly
			const MODEL_URL =
				"https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";

			try {
				console.log("Loading face detection models...");
				await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
				console.log("TinyFaceDetector loaded");

				await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
				console.log("FaceLandmark68 loaded");

				await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
				console.log("FaceExpression loaded");

				setModelsLoaded(true);
				console.log("All models loaded!");
			} catch (error) {
				console.error("Error loading models:", error);
			}
		};

		loadModels();

		// Clean up on unmount
		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
			}
		};
	}, []);

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
			.catch((err) => {
				console.error("Error accessing camera:", err);
			});
	};

	const stopVideo = () => {
		if (videoRef.current && videoRef.current.srcObject) {
			const tracks = videoRef.current.srcObject.getTracks();
			tracks.forEach((track) => track.stop());
			videoRef.current.srcObject = null;
			setCaptureVideo(false);

			// Clear detection interval
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}

			// Clear canvas
			if (canvasRef.current) {
				const ctx = canvasRef.current.getContext("2d");
				ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
			}
		}
	};

	const handleVideoPlay = () => {
		// Set canvas dimensions to match video
		canvasRef.current.width = videoRef.current.videoWidth;
		canvasRef.current.height = videoRef.current.videoHeight;

		// Clear any existing detection interval
		if (intervalRef.current) {
			clearInterval(intervalRef.current);
		}

		// Start face detection
		intervalRef.current = setInterval(async () => {
			if (videoRef.current && videoRef.current.readyState === 4) {
				// Get video dimensions
				const videoWidth = videoRef.current.videoWidth;
				const videoHeight = videoRef.current.videoHeight;

				// Match canvas dimensions
				canvasRef.current.width = videoWidth;
				canvasRef.current.height = videoHeight;

				// Detect faces
				const detections = await faceapi
					.detectAllFaces(
						videoRef.current,
						new faceapi.TinyFaceDetectorOptions()
					)
					.withFaceLandmarks()
					.withFaceExpressions();

				// Clear previous drawings
				const ctx = canvasRef.current.getContext("2d");
				ctx.clearRect(0, 0, videoWidth, videoHeight);

				// Draw results on canvas
				faceapi.draw.drawDetections(canvasRef.current, detections);
				faceapi.draw.drawFaceLandmarks(canvasRef.current, detections);
				faceapi.draw.drawFaceExpressions(canvasRef.current, detections);

				console.log("Detected faces:", detections.length);
			}
		}, 100);
	};

	return (
		<div className="app-container">
			<h1>Face Detection App</h1>

			{modelsLoaded ? (
				<div>
					{!captureVideo ? (
						<button onClick={startVideo}>Start Camera</button>
					) : (
						<button onClick={stopVideo}>Stop Camera</button>
					)}
				</div>
			) : (
				<p>Loading models... Please wait.</p>
			)}

			<div className="video-container" style={{ position: "relative" }}>
				{captureVideo && (
					<>
						<video
							ref={videoRef}
							autoPlay
							muted
							onPlay={handleVideoPlay}
							style={{ width: "100%", maxWidth: "600px" }}
						/>
						<canvas
							ref={canvasRef}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								maxWidth: "600px",
							}}
						/>
					</>
				)}
			</div>
		</div>
	);
}

export default App;

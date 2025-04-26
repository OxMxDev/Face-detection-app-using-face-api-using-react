import React, { useRef, useState, useEffect } from "react";
import * as faceapi from "face-api.js";

function App() {
	const [modelsLoaded, setModelsLoaded] = useState(false);
	const [captureVideo, setCaptureVideo] = useState(false);

	const videoRef = useRef();
	const canvasRef = useRef();
	const intervalRef = useRef();

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

				faceapi.draw.drawDetections(canvasRef.current, detections);
				faceapi.draw.drawFaceLandmarks(canvasRef.current, detections);

				detections.forEach((detection) => {
					const { age, gender, genderProbability, expressions } = detection;
					const { x, y, width } = detection.detection.box;

					// Draw glasses (filter)
					ctx.beginPath();
					ctx.moveTo(x + width * 0.25, y + width * 0.3);
					ctx.lineTo(x + width * 0.75, y + width * 0.3);
					ctx.strokeStyle = "blue";
					ctx.lineWidth = 4;
					ctx.stroke();
					ctx.closePath();

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

					// Smile detector
					if (topEmotion[0] === "happy" && topEmotion[1] > 0.6) {
						ctx.fillStyle = "lime";
						ctx.font = "bold 24px Arial";
						ctx.fillText("😊 You are smiling!", x, y + width + 50);
					}
				});

				console.log("Faces detected:", detections.length);
			}
		}, 100);
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
						<button onClick={stopVideo} style={buttonStyle}>
							Stop Camera
						</button>
					)}
				</div>
			) : (
				<p>Loading models... Please wait 🧠</p>
			)}

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
	transition: "background 0.3s ease",
};

export default App;

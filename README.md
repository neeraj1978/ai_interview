# AI Interviewer Platform

Welcome to the AI Interviewer Platform! This project is a comprehensive, microservices-based application designed to conduct AI-driven interviews. It features video/audio analysis, body language tracking, and intelligent conversational capabilities powered by LLMs.

## 🏗️ Architecture & Services

The platform is split into 5 distinct microservices across Node.js, Python, and Java (Spring Boot):

1. **Frontend (Next.js)** - `ai-interviewer`
   - The main user interface for the interview platform.
   - **Port:** `3000`
2. **Analysis Bridge (Python FastAPI)** - `analysis-bridge`
   - Handles real-time video/camera analysis (using MediaPipe and OpenCV) for body language and posture.
   - **Port:** `8000`
3. **Audio Backend (Python FastAPI)** - `backend-audio-python`
   - Processes audio input/output for the interview sessions.
   - **Port:** `8001`
4. **LLM Module (Java Spring Boot)** - `backend-llm-module`
   - The core backend logic that interacts with Large Language Models (LLMs) to generate interview questions and evaluate responses.
   - **Port:** `8082`
5. **User Service (Java Spring Boot)** - `user-service`
   - Manages user authentication, data, profiles, and email notifications.

## 🚀 Getting Started

To run the entire platform locally, you will need to open **5 separate terminal windows** and start each service from the root directory. 

For detailed, step-by-step startup instructions, please refer to the [START_SERVICES_GUIDE.md](./START_SERVICES_GUIDE.md) document in this repository.

## 🛠️ Prerequisites

- **Node.js** (for Next.js frontend)
- **Python 3.10+** (for Python FastAPI microservices)
- **Java 17+ & Maven** (for Spring Boot microservices)

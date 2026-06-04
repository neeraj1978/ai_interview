# Project Startup Guide

This document contains instructions on how to start all 5 services for this project correctly from your terminal. 

Since there are multiple services across Node.js, Python, and Java (Spring Boot), you will need to open **5 separate terminal windows** and run the respective commands from the root directory (`C:\Users\manoj\Desktop\backend (2)\backend`).

---

### 1. Frontend (Next.js App)
This runs the main user interface on `http://localhost:3000`.

```bash
cd ai-interviewer
npm run dev
```

---

### 2. Analysis Bridge (Python FastAPI)
This service handles video/camera analysis and runs on `http://localhost:8000`. 
*Note: If you move the project folder, you must delete the `venv` folder and recreate it using the first two commands before running the server.*

```bash
cd analysis-bridge

# 1. (First time only) Create virtual environment & install dependencies
python -m venv venv
venv\Scripts\python.exe -m pip install fastapi uvicorn mediapipe opencv-python pydantic httpx

# 2. Run the server
venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

---

### 3. Audio Backend (Python FastAPI)
This service handles audio processing and runs on `http://localhost:8001`.

```bash
cd backend-audio-python

# 1. (First time only) Create virtual environment & install dependencies
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt

# 2. Run the server
venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

---

### 4. LLM Module (Java Spring Boot)
This is the core backend logic for the AI Interviewer, running on `http://localhost:8082`.

```bash
cd backend-llm-module
.\mvnw.cmd spring-boot:run
```

---

### 5. User Service (Java Spring Boot)
This handles user authentication, data, and emails.

```bash
cd user-service
.\mvnw.cmd spring-boot:run
```

---

## Troubleshooting Tips
- **Python Virtual Environment Errors**: If you get a "Fatal error in launcher" when trying to run `uvicorn`, it means the absolute path of the project folder has changed. Delete the `venv` folder completely (`rmdir -Recurse -Force venv` in PowerShell), and recreate it using the installation commands above.
- **Port Conflicts**: Ensure ports `3000`, `8000`, `8001`, and `8082` are free before starting the services.

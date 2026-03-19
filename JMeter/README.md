# Simple Login System with FastAPI

A complete full-stack login/registration system with a FastAPI backend and vanilla JavaScript frontend.

## Features

### Backend
- ✅ User Registration
- ✅ User Login with JWT tokens
- ✅ Password hashing with bcrypt
- ✅ SQLite database
- ✅ Protected endpoints
- ✅ CORS enabled for frontend communication

### Frontend
- ✅ Clean and modern UI
- ✅ Login and Registration forms
- ✅ User dashboard after login
- ✅ Token-based authentication
- ✅ Error handling and validation
- ✅ Responsive design

## Installation

1. Install the required dependencies:
```bash
pip install -r requirements.txt
```

## Running the Application

### 1. Start the Backend Server

Start the FastAPI server:
```bash
python main.py
```

Or use uvicorn directly:
```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

### 2. Open the Frontend

Simply open `index.html` in your web browser, or use a local server:

**Option A: Direct file opening**
```bash
# Just open the file
open index.html  # macOS
xdg-open index.html  # Linux
start index.html  # Windows
```

**Option B: Using Python's built-in server (recommended)**
```bash
# In a new terminal, run:
python3 -m http.server 8080
# Then visit: http://localhost:8080
```

**Option C: Using VS Code Live Server**
- Install Live Server extension
- Right-click on `index.html` and select "Open with Live Server"

## API Endpoints

### 1. Root Endpoint
- **GET** `/`
- Returns API information and available endpoints

### 2. Register
- **POST** `/register`
- Register a new user
- **Request Body:**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "securepassword123"
}
```
- **Response:**
```json
{
  "id": 1,
  "username": "john_doe",
  "email": "john@example.com",
  "is_active": true
}
```

### 3. Login
- **POST** `/login`
- Login and receive JWT token
- **Request Body:**
```json
{
  "username": "john_doe",
  "password": "securepassword123"
}
```
- **Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### 4. Get Current User
- **GET** `/me`
- Get information about the currently logged-in user (requires authentication)
- **Headers:**
```
Authorization: Bearer <your_access_token>
```
- **Response:**
```json
{
  "id": 1,
  "username": "john_doe",
  "email": "john@example.com",
  "is_active": true
}
```

## Testing with curl

### Register a new user:
```bash
curl -X POST "http://localhost:8000/register" \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "email": "test@example.com", "password": "testpass123"}'
```

### Login:
```bash
curl -X POST "http://localhost:8000/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "testpass123"}'
```

### Get current user (replace TOKEN with your actual token):
```bash
curl -X GET "http://localhost:8000/me" \
  -H "Authorization: Bearer TOKEN"
```

## Interactive API Documentation

FastAPI provides automatic interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Security Notes

⚠️ **Important for Production:**
1. Change the `SECRET_KEY` in `auth.py` to a strong, random secret key
2. Use environment variables for sensitive configuration
3. Use a production-grade database (PostgreSQL, MySQL, etc.) instead of SQLite
4. Enable HTTPS
5. Add rate limiting
6. Implement email verification
7. Add password strength requirements

## Project Structure

```
.
├── Backend
│   ├── main.py           # FastAPI application and endpoints
│   ├── models.py         # Database models
│   ├── auth.py           # Authentication utilities (JWT, password hashing)
│   ├── database.py       # Database configuration and session management
│   └── requirements.txt  # Python dependencies
├── Frontend
│   ├── index.html        # Main HTML page with login/register forms
│   ├── style.css         # Styling for the frontend
│   └── app.js            # JavaScript for API communication and UI logic
└── users.db              # SQLite database (created automatically)
```

## Technologies Used

### Backend
- **FastAPI**: Modern, fast web framework for building APIs
- **SQLAlchemy**: SQL toolkit and ORM
- **SQLite**: Lightweight database
- **Passlib**: Password hashing library
- **python-jose**: JWT token handling
- **Uvicorn**: ASGI server

### Frontend
- **HTML5**: Structure and forms
- **CSS3**: Modern styling with gradients and animations
- **Vanilla JavaScript**: API integration and DOM manipulation
- **Fetch API**: HTTP requests to backend

## License

MIT

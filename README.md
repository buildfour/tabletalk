# TableTalk AI

Voice-powered restaurant ordering system with real-time order management.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-18%2B-green.svg)

## Overview

TableTalk AI enables restaurant customers to place orders using natural voice conversation with an AI assistant named Rachel, while providing staff with a real-time dashboard to manage orders through their lifecycle.

## Architecture

```
┌─────────────────┐      ┌────────────────────────────────┐
│   Customer UI   │─────▶│             Nginx              │
│  (Browser)      │      │        (Reverse Proxy)         │
└─────────────────┘      └───────────────┬────────────────┘
                                         │ (localhost:3000)
┌─────────────────┐      ┌───────────────▼────────────────┐
│  Restaurant UI  │─────▶│  Node.js API (PM2) on GCE VM   │
│   (Dashboard)   │      │        + WebSocket             │
└─────────────────┘      └───────────────┬────────────────┘
                                         │
                 ┌───────────────────────┘───────────────────────┐
                 │                                               │
                 ▼ (External APIs)                               ▼ (External DB)
┌─────────────────┐  ┌─────────────────┐      ┌──────────────────────────┐
│   ElevenLabs    │  │  Google Gemini  │      │ PostgreSQL DB            │
│   (Voice AI)    │  │  (NLP Parsing)  │      │ (Render)                 │
└─────────────────┘  └─────────────────┘      └──────────────────────────┘

```

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript (no frameworks)
- **Backend**: Node.js + Express
- **Database**: PostgreSQL (via pg library)
- **Deployment**: Google Compute Engine (VM)
- **Process Manager**: PM2
- **Web Server**: Nginx (as a Reverse Proxy)
- **Voice AI**: ElevenLabs Conversational AI
- **NLP**: Google Gemini for order intent parsing

## Prerequisites

- Node.js (v18 or higher)
- npm (usually comes with Node.js)
- PostgreSQL

## Quick Start (Local Development)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/buildfour/tabletalk.git
    cd tabletalk
    ```

2.  **Set up the database:**
    - Make sure you have PostgreSQL installed and running.
    - Create a new PostgreSQL database for this project.
    - The application will automatically create the necessary tables when it starts.

3.  **Configure the backend:**
    ```bash
    cd backend
    npm install
    cp .env.example .env
    ```
    - Edit the `.env` file and add your API keys and your PostgreSQL connection string (`DATABASE_URL`).

4.  **Start the backend server:**
    ```bash
    npm start
    ```
    The server will be running at `http://localhost:3000`.

5.  **Access the frontends:**
    - **Customer Frontend:** Open your browser and navigate to `http://localhost:3000/customer/`
    - **Restaurant Frontend:** Open your browser and navigate to `http://localhost:3000/restaurant/`

## Demo / Usage

### Customer

1.  Navigate to the customer frontend.
2.  Enter the access code
3.  Use your voice to interact with Rachel, the AI assistant, to place your order.

### Restaurant Staff

1.  Navigate to the restaurant frontend.
2.  Enter the access codes:
3.  View and manage incoming orders in real-time.

## Project Structure

- `backend/`: Contains the Node.js Express server, database logic, and API endpoints.
- `customer-frontend/`: The customer-facing UI for placing orders.
- `restaurant-frontend/`: The staff-facing UI for managing orders.

## Production Deployment

This project is deployed on a Google Compute Engine VM. 

```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/validate` | Validate customer table code |
| POST | `/api/auth/staff` | Staff authentication |
| GET | `/api/menu` | Get menu items by category |
| GET | `/api/orders` | List all orders |
| POST | `/api/orders` | Create new order |
| PATCH | `/api/orders/:id` | Update order status |
| GET | `/api/voice/signed-url` | Get ElevenLabs session URL |
| POST | `/api/ai/parse-order` | Parse voice input via Gemini |

---

## License

MIT License - See LICENSE file for details.

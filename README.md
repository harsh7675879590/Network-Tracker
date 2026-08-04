# NetworkTracker 🌐

NetworkTracker is a smart, AI-powered assistant for network management and monitoring. Built on a modern microservices architecture, it seamlessly integrates robust backend orchestration with specialized AI services to provide real-time insights, predict future trends, and answer questions about your network in plain English.

## 🏗️ Architecture

NetworkTracker is divided into small, independent services that communicate with each other to form a cohesive system:

*   **The Main Coordinator (Spring Boot):** The central hub of the application. It handles security, manages data flow, and orchestrates communication between the frontend and the AI services.
*   **The Specialist Team (Python/FastAPI):** A suite of AI-driven microservices. Each service acts as a "specialist" dedicated to a specific task, such as predicting traffic or answering natural language queries.
*   **The Information Hub (Databases):** Robust storage solutions for raw network data and the vector knowledge base used by the AI.
*   **Frontend (React):** An interactive dashboard for users to visualize data and interact with the AI services.

## 🧠 AI Services in Detail

The Python/FastAPI specialist team powers the intelligence behind NetworkTracker:

### 1. Time-Series Forecasting
Analyzes historical network traffic data (e.g., bandwidth usage, active user counts) to predict future trends. It leverages deep learning models, such as Transformers, to identify complex patterns and forecast potential network congestion before it happens.

### 2. Congestion Detection
A real-time monitoring service that continuously analyzes incoming traffic data. It uses advanced algorithms to instantly spot unusual spikes or drops, alerting you to potential network issues or anomalies.

### 3. RAG Chatbot (Your Network's ChatGPT)
Allows you to query your network data in plain English (e.g., *"Which IPs were rejected today?"*).
*   **Data Ingestion:** Network logs are transformed into mathematical embeddings and stored in **ChromaDB**.
*   **The "Brain":** Upon receiving a question, the system searches ChromaDB for the most relevant log entries.
*   **The "Answer":** The retrieved context and the user's query are processed by a Large Language Model via **LangChain** to generate a clear, human-readable response.

## 🔄 Workflow

Here is how the components work together to serve a request:

1.  **User Request:** A user asks a question or requests a forecast via the **React** frontend (e.g., "Show me the traffic forecast for next Tuesday").
2.  **Backend Orchestration:** The **Spring Boot** backend receives the request. It authenticates the user using **Keycloak** and routes the request to the appropriate AI microservice.
3.  **AI Analysis:** The specific **Python/FastAPI** service (e.g., Time-Series Forecasting) processes the request, retrieves necessary data from the Information Hub, and generates the insight/prediction.
4.  **Response:** The result is sent back through the Spring Boot hub to the React frontend, where it is beautifully displayed on the dashboard.

## 🛠️ Tech Stack & Infrastructure

*   **Frontend:** React
*   **Backend / API Gateway:** Java / Spring Boot
*   **AI Microservices:** Python / FastAPI
*   **AI / ML:** LangChain, Transformer Models
*   **Vector Database:** ChromaDB
*   **Authentication:** Keycloak
*   **Containerization:** Docker
*   **Monitoring & Observability:** Elasticsearch & Kibana (ELK Stack)

# Notes

## How to run

1. **Start the Database**
   Run the postgres container using docker-compose:
   ```bash
   docker-compose up -d
   ```

2. **Initialize the Database**
   Migrate the schema and seed the initial inventory:
   ```bash
   npm install
   npm run db:reset
   ```

3. **Start the Backend Server**
   Start the backend on port 4000:
   ```bash
   npm run dev
   ```

4. **Start the Next.js Frontend**
   In a new terminal window, navigate into the `frontend` folder and start the dev server:
   ```bash
   cd frontend
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

## Requirements

- Node.js (v18 or higher)
- Docker and docker-compose (for the database)
- An `.env` file (you can copy `.env.example` to `.env`)


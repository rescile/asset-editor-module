# Asset Inventory CSV Editor

## Overview
This application is a simple, web-based CSV table editor that communicates with the rescile backend. It enables developers and administrators to manage asset data natively stored in CSV files, supporting both full file mutations and partial writes.

## API Interfaces

The backend exposes endpoints under `/api/assets` to manage CSV files. The API supports reading, full replacements, and partial writes (updates/deletions).

### 1. List Assets
- **URL:** `/api/assets/`
- **Method:** `GET`
- **Response:** Returns a JSON array or object containing the list of available `.csv` asset files.

### 2. Read Asset
- **URL:** `/api/assets/{filename}`
- **Method:** `GET`
- **Response:** Returns the raw text content of the CSV file. Returns `404` if the file does not exist.

### 3. Mutate Asset (Writes)
- **URL:** `/api/assets/{filename}`
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`

The mutation endpoint accepts one of three fields in the form data to dictate how the file is processed:

#### A. Full Overwrite (`data`)
Replaces the entire content of the CSV file.
- **Field Name:** `data`
- **Value:** The complete CSV string (including headers).
- **Example:**
  ```javascript
  const fd = new FormData();
  fd.append('data', 'name,customer\ninst1,ydc\ninst2,ydc');
  fetch('/api/assets/instance.csv', { method: 'POST', body: fd });
  ```

#### B. Partial Write / Update (`update`)
Updates existing rows or appends new rows based on the primary key (typically the first column).
- **Field Name:** `update`
- **Value:** A CSV string containing the headers and the row(s) to be updated or added.
- **Note:** Only modifies matched rows and leaves all other entries intact.

#### C. Partial Write / Delete (`remove`)
Removes specific rows based on the primary key.
- **Field Name:** `remove`
- **Value:** A CSV string containing the header of the primary key and the keys of the row(s) to delete.
- **Note:** This effectively deletes the respective record(s) without needing to re-send the whole dataset.

## Live Update and Build Status Integration

To provide real-time feedback when the rescile backend is processing CSV changes or generating a new graph, you can integrate live updates into your frontend.

### 1. Build Logs Stream
When a mutation is triggered, you can display live build logs by connecting to the server-sent events (SSE) endpoint:
- **URL:** `/api/build/stream`
- **Method:** `GET`
Listen to messages until the stream sends `BUILD_COMPLETE`.

### 2. Polling Engine Status
Background tasks might still be updating the enterprise graph. You can poll the backend to check if an update is currently running:
- **URL:** `/api/engine-info`
- **Method:** `GET`
- **Response:** Returns a JSON object with `is_publishing` (boolean). Use this to show a global "Update Running" banner, and auto-refresh your application's data when `is_publishing` transitions from `true` to `false`.

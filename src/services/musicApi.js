
const API_BASE_URL = (
    import.meta.env.VITE_API_BASE_URL ||
    "https://musicy-db.yurphagames.net"
).replace(/\/+$/, "");

async function handleResponse(response) {
    const contentType = response.headers.get("content-type") || "";

    let data;

    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        data = await response.text();
    }

    if (!response.ok) {
        const message =
            typeof data === "object" && data !== null
                ? data.message || data.error || JSON.stringify(data)
                : data || `Request failed with status ${response.status}`;

        throw new Error(message);
    }

    return data;
}

export async function generateComposition(compositionRequest) {
    const response = await fetch(
        `${API_BASE_URL}/api/compositions/generate`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify(compositionRequest)
        }
    );

    return handleResponse(response);
}

export async function getCompositionLibrary() {
    const response = await fetch(
        `${API_BASE_URL}/api/compositions`,
        {
            method: "GET",
            headers: {
                Accept: "application/json"
            }
        }
    );

    return handleResponse(response);
}

export async function deleteComposition(fileName) {
    if (!fileName) {
        throw new Error("No composition filename was provided.");
    }

    const response = await fetch(
        `${API_BASE_URL}/api/compositions/${encodeURIComponent(fileName)}`,
        {
            method: "DELETE",
            headers: {
                Accept: "application/json"
            }
        }
    );

    return handleResponse(response);
}

export function getCompositionDownloadUrl(composition) {
    if (!composition) {
        throw new Error("No composition was provided.");
    }

    if (composition.downloadUrl) {
        try {
            return new URL(
                composition.downloadUrl,
                `${API_BASE_URL}/`
            ).toString();
        } catch {
            throw new Error("The backend returned an invalid download URL.");
        }
    }

    if (composition.fileName) {
        return `${API_BASE_URL}/api/compositions/download/${encodeURIComponent(
            composition.fileName
        )}`;
    }

    throw new Error(
        "The backend response does not contain a download URL or filename."
    );
}

export async function downloadComposition(composition) {
    const downloadUrl = getCompositionDownloadUrl(composition);
    const response = await fetch(downloadUrl);

    if (!response.ok) {
        throw new Error(`MIDI download failed (${response.status}).`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = composition.fileName || "musicy-composition.mid";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(objectUrl);
}

export function getApiBaseUrl() {
    return API_BASE_URL;
}

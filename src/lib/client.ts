import axios from 'axios';

const baseURL = 'http://localhost:3000/api'; // Adjust the base URL as needed

// Helper function to create a new session
export async function createSession(): Promise<string> {
    try {
        const response = await axios.post(`${baseURL}/session`);
        console.log('Session created:', response.data.uuid);
        return response.data.uuid;
    } catch (error) {
        console.error('Failed to create session', error);
        throw error;
    }
}

// Helper function to upload an image
export async function uploadImage(sessionId: string, imageData: string): Promise<void> {
    try {
        await axios.post(`${baseURL}/session/${sessionId}/image`, { image: imageData });
        console.log('Image uploaded successfully');
    } catch (error) {
        console.error('Failed to upload image', error);
        throw error;
    }
}

// Helper function to generate a video
export async function generateVideo(sessionId: string): Promise<void> {
    try {
        await axios.post(`${baseURL}/session/${sessionId}/video`);
        console.log('Video generation started');
    } catch (error) {
        console.error('Failed to start video generation', error);
        throw error;
    }
}

// Function to provide the download link for the video
export function getVideoDownloadLink(sessionId: string): string {
    const downloadLink = `${baseURL}/session/${sessionId}/video`;
    console.log(`Video can be downloaded from: ${downloadLink}`);
    return downloadLink;
}

export function deleteSession(sessionId: string): void {
    try {
        axios.delete(`${baseURL}/session/${sessionId}`);
        console.log('Session deleted:', sessionId);
    } catch (error) {
        console.error('Failed to delete session', error);
        throw error;
    }
}

// // Example usage
// async function main() {
//     const sessionId = await createSession();
//     const imageData = 'data:image/jpg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAoHBwgHBgoJCAkLCwoMDxkQDw4ODx4WFxIZJCAmJSMgIyIoLTkwKCo2KyIjMkQyNqsFYoRCOpB9ydCPq6+/8AAEQgBAADAAwERAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EABUBAQEAAAAAAAAAAAAAAAAAAAIE/9oADAMBAAIQAxAAAAF2UVJgF1phSp//xAAcEAACAgIDAAAAAAAAAAAAAAABAgADBBEFEjH/2gAIAQEAAT8AlLLCsJu8WkKivtZw9qsSppWVfpqy//9k=';

//     // For demonstration, simulate uploading images
//     await uploadImage(sessionId, imageData);
//     await uploadImage(sessionId, imageData);

//     await generateVideo(sessionId);

//     // Get the download link
//     getVideoDownloadLink(sessionId);
// }

// main().catch(console.error);

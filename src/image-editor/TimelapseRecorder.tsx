import React, { useState, useEffect } from 'react';
import {
    createSession,
    generateVideo,
    getVideoDownloadLink,
    uploadImage,
    deleteSession
} from "../lib/client";
import { Renderer } from './renderer';
import { useCache } from '../lib/cache';
import moment from 'moment';

interface Props {
    renderer: Renderer;
}

const TimelapseRecorder: React.FC<Props> = ({ renderer }) => {
    const [recording, setRecording] = useCache("recording", false);
    const [sessionId, setSessionId] = useCache<string | null>("sessionId", null);
    const [videoGenerated, setVideoGenerated] = useCache("videoGenerated", false);
    const [downloadLink, setDownloadLink] = useCache<string | null>("downloadLink", null);

    useEffect(() => {
        if (!renderer || !sessionId) {
            return;
        }
        let lastSnapshot = moment();
        let lastUpload = moment();
        const onSnapshot = async () => {
            if (!recording || !sessionId) {
                return;
            }
            lastSnapshot = moment();
            // const encodedImage = renderer.getEncodedImage(null, 'jpeg', true);
            // if (!encodedImage) {
            //     console.error('Failed to encode image');
            //     return;
            // }
            // await uploadImage(sessionId, encodedImage);
        };
        renderer.addSnapshotListener(onSnapshot);
        const timer = window.setInterval(async () => {
            if (recording) {
                if (lastSnapshot.isAfter(lastUpload)) {
                    const encodedImage = renderer.getEncodedImage(null, 'jpeg', true);
                    if (!encodedImage) {
                        console.error('Failed to encode image');
                        return;
                    }
                    await uploadImage(sessionId, encodedImage);
                    lastUpload = moment();
                }
            }
        }, 1000);

        return () => {
            renderer.removeSnapshotListener(onSnapshot);
            window.clearInterval(timer);
        };
    }, [renderer, recording, sessionId]);

    const handleRecordClick = async () => {
        if (!sessionId) {
            // const { data } = await axios.post(`${baseURL}/session`);
            const uuid = await createSession();
            setSessionId(uuid);
            console.log('Session started:', uuid);
        } else {
            // Placeholder for stopping the recording logic
        }
        setRecording(!recording);
    };

    const handleGenerateVideo = async () => {
        if (!sessionId) {
            alert('No active session to generate video from.');
            return;
        }
        // await axios.post(`${baseURL}/session/${sessionId}/video`);
        await generateVideo(sessionId);
        // video is ready for download
        setVideoGenerated(true);
        const downloadLink = getVideoDownloadLink(sessionId);
        setDownloadLink(downloadLink);
    };

    const handleCleanup = async () => {
        if (!sessionId) {
            return;
        }
        await deleteSession(sessionId);
        setSessionId(null);
        setRecording(false);
        setVideoGenerated(false);
        setDownloadLink(null);
    }
        

    return (
        <div style={{ textAlign: 'center', padding: '20px' }}>
            <button onClick={handleRecordClick} style={{ fontSize: '24px', padding: '10px', margin: '5px' }}>
                <i className={`fa fa-${recording ? 'stop' : 'circle'}`} />
                {recording ? ' Stop' : ' Start'}
            </button>
            {!videoGenerated && (<button onClick={handleGenerateVideo} style={{ fontSize: '24px', padding: '10px', margin: '5px' }}>
                <i className="fa fa-video" /> Generate
            </button>)}
            {downloadLink && (
                <a href={downloadLink} download="timelapse.mp4" style={{ fontSize: '24px', padding: '10px', margin: '5px' }}>
                    <i className="fa fa-download" /> Download
                </a>
            )}
            {sessionId && (
                <button onClick={handleCleanup} style={{ fontSize: '24px', padding: '10px', margin: '5px' }}>
                    <i className="fa fa-trash" /> Cleanup
                </button>
            )}
        </div>
    );
};

export default TimelapseRecorder;

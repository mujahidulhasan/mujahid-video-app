const API_BASE_URL = 'http://127.0.0.1:5000';

// Get DOM elements
const videoUrlInput = document.getElementById('videoUrl');
const getInfoBtn = document.getElementById('getInfoBtn');
const loadingSpinner = document.getElementById('loading');
const statusMessage = document.getElementById('statusMessage');
const videoInfoSection = document.getElementById('videoInfo');
const thumbnailImg = document.getElementById('thumbnail');
const videoTitleElem = document.getElementById('videoTitle');
const channelNameElem = document.getElementById('channelName');
const durationElem = document.getElementById('duration');
const viewsElem = document.getElementById('views');

const downloadHdThumbnailBtn = document.getElementById('downloadHdThumbnailBtn');
const videoQualitySelect = document.getElementById('videoQualitySelect');
const audioQualitySelect = document.getElementById('audioQualitySelect');
const downloadBtn = document.getElementById('downloadBtn');

const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');
const downloadSegmentBtn = document.getElementById('downloadSegmentBtn');
const formatToggleBtns = document.querySelectorAll('.format-toggle-btn');

const themeToggleBtn = document.getElementById('themeToggle');

// Progress bar elements
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');


let currentVideoFormats = [];
let currentAudioFormats = [];
let currentVideoTitle = '';
let currentHdThumbnailUrl = '';
let videoDurationSeconds = 0;

// --- Helper Functions ---

function showLoading(message = 'Loading...') {
    loadingSpinner.style.display = 'block';
    statusMessage.textContent = message;
    statusMessage.className = 'status-message';
    getInfoBtn.disabled = true;
    downloadBtn.disabled = true;
    downloadSegmentBtn.disabled = true;
    downloadHdThumbnailBtn.disabled = true;
    videoQualitySelect.disabled = true;
    audioQualitySelect.disabled = true;
    startTimeInput.disabled = true;
    endTimeInput.disabled = true;
    videoInfoSection.style.display = 'none';
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
}

function hideLoading() {
    loadingSpinner.style.display = 'none';
    statusMessage.textContent = '';
    getInfoBtn.disabled = false;
}

function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
}

function formatDuration(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
        return 'N/A';
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (h > 0) parts.push(String(h).padStart(2, '0'));
    parts.push(String(m).padStart(2, '0'));
    parts.push(String(s).padStart(2, '0'));

    return parts.join(':');
}

function formatViews(views) {
    if (typeof views !== 'number' || isNaN(views)) {
        return 'N/A';
    }
    return views.toLocaleString();
}

function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes === 0) {
        return 'N/A';
    }
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

// --- Theme Toggle Functionality ---
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    themeToggleBtn.textContent = newTheme === 'dark' ? 'Toggle Day Mode' : 'Toggle Night Mode';
}

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggleBtn.textContent = savedTheme === 'dark' ? 'Toggle Day Mode' : 'Toggle Night Mode';
});

// --- Timestamp Formatting Functions ---
function secondsToHHMMSS(seconds) {
    if (isNaN(seconds) || seconds < 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function hhmmssToSeconds(hhmmss) {
    const parts = hhmmss.split(':').map(Number);
    if (parts.some(isNaN)) return NaN;
    if (parts.length === 3) { // HH:MM:SS
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) { // MM:SS
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 1) { // SS
        return parts[0];
    }
    return NaN;
}

function applyTimeFormat(format) {
    let startVal = startTimeInput.value.trim();
    let endVal = endTimeInput.value.trim();

    if (format === 'hhmmss') {
        if (startVal && !startVal.includes(':')) {
            startTimeInput.value = secondsToHHMMSS(parseInt(startVal));
        } else if (!startVal && videoDurationSeconds) { // Default start if empty
             startTimeInput.value = secondsToHHMMSS(0);
        }
        if (endVal && !endVal.includes(':')) {
            endTimeInput.value = secondsToHHMMSS(parseInt(endVal));
        } else if (!endVal && videoDurationSeconds) { // Default end if empty
            endTimeInput.value = secondsToHHMMSS(Math.min(videoDurationSeconds, 600)); // 10 mins or end of video
        }
    } else if (format === 'seconds') {
        if (startVal && startVal.includes(':')) {
            startTimeInput.value = hhmmssToSeconds(startVal);
        } else if (!startVal && videoDurationSeconds) { // Default start if empty
            startTimeInput.value = 0;
        }
        if (endVal && endVal.includes(':')) {
            endTimeInput.value = hhmmssToSeconds(endVal);
        } else if (!endVal && videoDurationSeconds) { // Default end if empty
            endTimeInput.value = Math.min(videoDurationSeconds, 600);
        }
    }

    formatToggleBtns.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.format-toggle-btn[data-format="${format}"]`).classList.add('active');
}

// --- Main Functions ---

async function getVideoInformation() {
    const videoUrl = videoUrlInput.value.trim();
    if (!videoUrl) {
        showStatus('Please enter a YouTube video URL.', 'error');
        return;
    }

    const youtubeRegex = /^(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|)([\w-]{11})(?:\S+)?$/;
    if (!youtubeRegex.test(videoUrl)) {
        showStatus('Please enter a valid YouTube URL (e.g., youtube.com/watch?v=...).', 'error');
        return;
    }

    showLoading('Fetching video information...');
    videoInfoSection.style.display = 'none';
    videoQualitySelect.innerHTML = '<option value="">-- Select Video --</option>';
    audioQualitySelect.innerHTML = '<option value="">-- Select Audio --</option>';
    downloadBtn.disabled = true;
    downloadSegmentBtn.disabled = true;
    downloadHdThumbnailBtn.disabled = true;
    startTimeInput.value = '';
    endTimeInput.value = '';

    try {
        const response = await fetch(`${API_BASE_URL}/get_video_info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: videoUrl })
        });

        const data = await response.json();

        if (response.ok) {
            hideLoading();
            showStatus('Video information retrieved successfully!', 'success');
            displayVideoInfo(data);
            currentVideoTitle = data.title;
            currentVideoFormats = data.video_formats || [];
            currentAudioFormats = data.audio_formats || [];
            currentHdThumbnailUrl = data.hd_thumbnail || data.thumbnail;
            videoDurationSeconds = data.duration;

            // Set default timestamp values
            if (videoDurationSeconds && videoDurationSeconds > 0) {
                startTimeInput.value = secondsToHHMMSS(0);
                endTimeInput.value = secondsToHHMMSS(Math.min(videoDurationSeconds, 600)); // Default 10 mins or end of video
            } else {
                startTimeInput.value = '00:00:00';
                endTimeInput.value = '00:00:10';
            }
            applyTimeFormat('hhmmss'); // Activate HH:MM:SS format button

            populateQualityDropdowns();
            downloadHdThumbnailBtn.disabled = false;
            downloadSegmentBtn.disabled = false;
            startTimeInput.disabled = false;
            endTimeInput.disabled = false;
        } else {
            hideLoading();
            showStatus(`Error: ${data.error || 'Failed to get video info.'}`, 'error');
            videoInfoSection.style.display = 'none';
        }

    } catch (error) {
        console.error('Error fetching video info:', error);
        hideLoading();
        showStatus('Network error or server unavailable. Please try again later.', 'error');
        videoInfoSection.style.display = 'none';
    }
}

function displayVideoInfo(info) {
    thumbnailImg.src = info.thumbnail;
    thumbnailImg.alt = info.title;
    videoTitleElem.textContent = info.title;
    channelNameElem.textContent = info.channel;
    durationElem.textContent = formatDuration(info.duration);
    viewsElem.textContent = formatViews(info.views);
    
    videoInfoSection.style.display = 'block';
}

function populateQualityDropdowns() {
    videoQualitySelect.innerHTML = '<option value="">-- Select Video --</option>';
    audioQualitySelect.innerHTML = '<option value="">-- Select Audio --</option>';

    currentVideoFormats.forEach(format => {
        const option = document.createElement('option');
        option.value = format.format_id;
        option.dataset.ext = format.ext;
        option.textContent = `${format.quality} ${format.filesize ? `(${formatFileSize(format.filesize)})` : ''}`;
        videoQualitySelect.appendChild(option);
    });

    currentAudioFormats.forEach(format => {
        const option = document.createElement('option');
        option.value = format.format_id;
        option.dataset.ext = format.ext;
        option.textContent = `${format.quality} ${format.filesize ? `(${formatFileSize(format.filesize)})` : ''}`;
        audioQualitySelect.appendChild(option);
    });

    videoQualitySelect.disabled = currentVideoFormats.length === 0;
    audioQualitySelect.disabled = currentAudioFormats.length === 0;
}

function updateDownloadButtonState() {
    const selectedVideo = videoQualitySelect.value;
    const selectedAudio = audioQualitySelect.value;

    downloadBtn.disabled = !(selectedVideo || selectedAudio);
}

async function downloadSelectedMedia() {
    const selectedVideoFormatId = videoQualitySelect.value;
    const selectedVideoExt = videoQualitySelect.selectedOptions[0]?.dataset.ext;

    const selectedAudioFormatId = audioQualitySelect.value;
    const selectedAudioExt = audioQualitySelect.selectedOptions[0]?.dataset.ext;

    let formatIdToDownload = '';
    let extToDownload = '';

    if (selectedVideoFormatId && selectedAudioFormatId) {
        formatIdToDownload = selectedVideoFormatId; // Prioritize video, backend merges audio
        extToDownload = selectedVideoExt;
        showStatus('Downloading video with selected quality. Audio will be merged automatically by server. (This might take a while)', 'info');
    } else if (selectedVideoFormatId) {
        formatIdToDownload = selectedVideoFormatId;
        extToDownload = selectedVideoExt;
        showStatus('Downloading selected video quality. Audio will be merged automatically by server. (This might take a while)', 'info');
    } else if (selectedAudioFormatId) {
        formatIdToDownload = selectedAudioFormatId;
        extToDownload = selectedAudioExt;
        showStatus('Downloading selected audio quality. (This might take a while)', 'info');
    } else {
        showStatus('Please select either a video or an audio quality to download.', 'error');
        return;
    }

    const videoUrl = videoUrlInput.value.trim();
    if (!videoUrl) {
        showStatus('No video URL found for download. Please re-enter.', 'error');
        return;
    }

    showLoading('Initiating download...');
    progressContainer.style.display = 'block'; // Show progress bar
    progressBar.style.width = '0%'; // Reset progress
    downloadBtn.disabled = true;

    try {
        // Simulated progress bar for visual feedback
        let simulatedProgress = 0;
        const progressInterval = setInterval(() => {
            if (simulatedProgress < 90) { // Stop at 90% to indicate server processing
                simulatedProgress += 5;
                progressBar.style.width = `${simulatedProgress}%`;
            }
        }, 500); // Update every 0.5 seconds

        const response = await fetch(`${API_BASE_URL}/download_video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: videoUrl,
                format_id: formatIdToDownload,
                ext: extToDownload,
                title: currentVideoTitle
            })
        });

        clearInterval(progressInterval); // Stop simulation
        progressBar.style.width = '100%'; // Complete progress

        if (response.ok) {
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'download';
            if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
                const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?;?/);
                if (filenameMatch && filenameMatch[1]) {
                    try {
                        filename = decodeURIComponent(filenameMatch[1].replace(/\+/g, ' '));
                    } catch (e) {
                        filename = filenameMatch[1];
                    }
                }
            } else {
                filename = `${currentVideoTitle || 'video'}.${extToDownload || 'mp4'}`;
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

            showStatus('Download started! Check your browser\'s downloads. (Download Complete!)', 'success');
            videoQualitySelect.value = '';
            audioQualitySelect.value = '';
            updateDownloadButtonState();
            progressContainer.style.display = 'none';
        } else {
            const errorData = await response.json();
            showStatus(`Error: ${errorData.error || 'Failed to start download.'}`, 'error');
            downloadBtn.disabled = false;
            progressContainer.style.display = 'none';
        }

    } catch (error) {
        console.error('Error initiating download:', error);
        showStatus('Network error or server unavailable during download. Please try again.', 'error');
        downloadBtn.disabled = false;
        progressContainer.style.display = 'none';
    } finally {
        hideLoading();
    }
}

async function downloadHdThumbnail() {
    if (!currentHdThumbnailUrl) {
        showStatus('No HD thumbnail available or video info not fetched.', 'error');
        return;
    }

    showLoading('Downloading thumbnail...');
    downloadHdThumbnailBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/download_thumbnail`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                thumbnail_url: currentHdThumbnailUrl,
                video_title: currentVideoTitle
            })
        });

        if (response.ok) {
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'thumbnail.jpg';
            if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
                const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?;?/);
                if (filenameMatch && filenameMatch[1]) {
                    try {
                        filename = decodeURIComponent(filenameMatch[1].replace(/\+/g, ' '));
                    } catch (e) {
                        filename = filenameMatch[1];
                    }
                }
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

            showStatus('HD Thumbnail download initiated!', 'success');
        } else {
            const errorData = await response.json();
            showStatus(`Error downloading thumbnail: ${errorData.error || 'Failed to download thumbnail.'}`, 'error');
        }
    } catch (error) {
        console.error('Error initiating thumbnail download:', error);
        showStatus('Network error or server unavailable for thumbnail. Please try again.', 'error');
    } finally {
        hideLoading();
        downloadHdThumbnailBtn.disabled = false;
    }
}


async function downloadVideoSegment() {
    const videoUrl = videoUrlInput.value.trim();
    let startTime = startTimeInput.value.trim();
    let endTime = endTimeInput.value.trim();

    const startTimeInSeconds = hhmmssToSeconds(startTime);
    const endTimeInSeconds = hhmmssToSeconds(endTime);

    if (isNaN(startTimeInSeconds) || isNaN(endTimeInSeconds)) {
        showStatus('Invalid time format. Use HH:MM:SS (e.g., 00:01:30) or seconds (e.g., 90).', 'error');
        return;
    }

    if (endTimeInSeconds <= startTimeInSeconds) {
        showStatus('End time must be after start time.', 'error');
        return;
    }
    
    // Cap end time to video duration if it exceeds it
    if (videoDurationSeconds && endTimeInSeconds > videoDurationSeconds) {
        endTime = videoDurationSeconds; // Use actual duration for backend
        showStatus('End time adjusted to video duration.', 'info');
    } else {
        endTime = endTimeInSeconds;
    }
    startTime = startTimeInSeconds; // Use seconds for backend


    if (!videoUrl) {
        showStatus('Please get video info first.', 'error');
        return;
    }


    showLoading('Initiating segment download... (This might take a while)');
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    downloadSegmentBtn.disabled = true;

    try {
        let simulatedProgress = 0;
        const progressInterval = setInterval(() => {
            if (simulatedProgress < 90) {
                simulatedProgress += 5;
                progressBar.style.width = `${simulatedProgress}%`;
            }
        }, 500);

        const response = await fetch(`${API_BASE_URL}/download_timestamped_video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: videoUrl,
                start_time: startTime,
                end_time: endTime,
                title: currentVideoTitle
            })
        });

        clearInterval(progressInterval);
        progressBar.style.width = '100%';

        if (response.ok) {
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'download_segment.mp4';
            if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
                const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?;?/);
                if (filenameMatch && filenameMatch[1]) {
                    try {
                        filename = decodeURIComponent(filenameMatch[1].replace(/\+/g, ' '));
                    } catch (e) {
                        filename = filenameMatch[1];
                    }
                }
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

            showStatus('Video segment download started! Check your browser\'s downloads. (Download Complete!)', 'success');
            startTimeInput.value = '';
            endTimeInput.value = '';
            downloadSegmentBtn.disabled = false;
            progressContainer.style.display = 'none';
        } else {
            const errorData = await response.json();
            showStatus(`Error: ${errorData.error || 'Failed to download segment.'}`, 'error');
            downloadSegmentBtn.disabled = false;
            progressContainer.style.display = 'none';
        }

    } catch (error) {
        console.error('Error initiating segment download:', error);
        showStatus('Network error or server unavailable during segment download. Please try again.', 'error');
        downloadSegmentBtn.disabled = false;
        progressContainer.style.display = 'none';
    } finally {
        hideLoading();
    }
}


// --- Event Listeners ---

getInfoBtn.addEventListener('click', getVideoInformation);
downloadHdThumbnailBtn.addEventListener('click', downloadHdThumbnail);
downloadBtn.addEventListener('click', downloadSelectedMedia);
downloadSegmentBtn.addEventListener('click', downloadVideoSegment);
themeToggleBtn.addEventListener('click', toggleTheme);

videoQualitySelect.addEventListener('change', updateDownloadButtonState);
audioQualitySelect.addEventListener('change', updateDownloadButtonState);

// Add event listeners for timestamp format toggles
formatToggleBtns.forEach(button => {
    button.addEventListener('click', () => {
        applyTimeFormat(button.dataset.format);
    });
});

videoUrlInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        getInfoBtn.click();
    }
});
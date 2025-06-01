from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
import yt_dlp
import os # This import is already here, no change needed for this line
import threading
import uuid
import re
# import mimetypes # These imports were commented out in your provided code
# import requests # These imports were commented out in your provided code

app = Flask(__name__)
CORS(app)

DOWNLOAD_DIR = 'downloads'
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/get_video_info', methods=['POST'])
def get_video_info():
    data = request.get_json()
    video_url = data.get('url')

    if not video_url:
        return jsonify({"error": "No URL provided"}), 400

    try:
        # --- START OF PROXY ADDITION FOR get_video_info ---
        proxy_url = os.environ.get('PROXY_URL') 
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'force_generic_extractor': True,
            'skip_download': True,
            'format_sort': ['res', 'ext'],
        }
        
        if proxy_url:
            ydl_opts['proxy'] = proxy_url
            print(f"DEBUG: Using proxy for get_video_info: {proxy_url}") # For debugging in Render logs
        # --- END OF PROXY ADDITION FOR get_video_info ---

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            
            video_title = info.get('title', 'N/A')
            thumbnail_url = info.get('thumbnail', 'N/A')
            channel = info.get('uploader', 'N/A')
            duration = info.get('duration', 0)
            view_count = info.get('view_count', 0)

            high_res_thumbnail = thumbnail_url
            if 'thumbnails' in info and info['thumbnails']:
                sorted_thumbnails = sorted(info['thumbnails'], key=lambda x: x.get('width', 0) * x.get('height', 0), reverse=True)
                if sorted_thumbnails:
                    high_res_thumbnail = sorted_thumbnails[0].get('url', thumbnail_url)

            video_formats = []
            audio_formats = []
            
            seen_video_qualities = set()
            seen_audio_qualities = set()

            if 'formats' in info:
                for f in info['formats']:
                    # Combined formats (video+audio)
                    if f.get('vcodec') != 'none' and f.get('acodec') != 'none' and f.get('height'):
                        quality_label = f'{f.get("height")}p MP4 (Combined)'
                        if quality_label not in seen_video_qualities:
                            video_formats.append({
                                'format_id': f.get('format_id'),
                                'quality': quality_label,
                                'ext': f.get('ext', 'mp4'),
                                'filesize': f.get('filesize')
                            })
                            seen_video_qualities.add(quality_label)
                    
                    # Video-only streams
                    elif f.get('vcodec') != 'none' and f.get('acodec') == 'none' and f.get('height'):
                        quality_label = f'{f.get("height")}p MP4' # Will be merged with audio
                        if quality_label not in seen_video_qualities:
                            video_formats.append({
                                'format_id': f.get('format_id'),
                                'quality': quality_label,
                                'ext': 'mp4', # Assumed output after merge
                                'filesize': f.get('filesize') # Video stream filesize
                            })
                            seen_video_qualities.add(quality_label)

                    # Audio-only streams
                    elif f.get('acodec') != 'none' and f.get('vcodec') == 'none':
                        quality_label = ''
                        if f.get('ext') == 'mp3':
                            quality_label = 'Audio Only MP3'
                        elif f.get('ext') == 'm4a':
                            quality_label = 'Audio Only M4A'
                        elif f.get('ext') == 'webm' and f.get('acodec') == 'opus':
                             quality_label = 'Audio Only Opus (WebM)'
                        
                        if quality_label and quality_label not in seen_audio_qualities:
                            audio_formats.append({
                                'format_id': f.get('format_id'),
                                'quality': quality_label,
                                'ext': f.get('ext'),
                                'filesize': f.get('filesize')
                            })
                            seen_audio_qualities.add(quality_label)
            
            if not video_formats:
                video_formats.append({
                    'format_id': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
                    'quality': 'Best Quality (MP4)',
                    'ext': 'mp4',
                    'filesize': None
                })
            if not audio_formats:
                audio_formats.append({
                    'format_id': 'bestaudio[ext=mp3]/bestaudio',
                    'quality': 'Best Audio (MP3)',
                    'ext': 'mp3',
                    'filesize': None
                })
                audio_formats.append({
                    'format_id': 'bestaudio',
                    'quality': 'Best Audio (Original)',
                    'ext': 'm4a',
                    'filesize': None
                })

            video_formats.sort(key=lambda x: int(x['quality'].split('p')[0]) if 'p' in x['quality'] else -1, reverse=True)
            audio_formats.sort(key=lambda x: x['quality'])

            return jsonify({
                "title": video_title,
                "thumbnail": thumbnail_url,
                "hd_thumbnail": high_res_thumbnail,
                "channel": channel,
                "duration": duration,
                "views": view_count,
                "video_formats": video_formats,
                "audio_formats": audio_formats
            })

    except yt_dlp.DownloadError as e:
        error_message = str(e)
        if "age-restricted" in error_message:
            return jsonify({"error": "This video is age-restricted and cannot be downloaded directly."}), 403
        elif "private" in error_message:
            return jsonify({"error": "This video is private and cannot be accessed."}), 403
        elif "unavailable" in error_message or "deleted" in error_message:
            return jsonify({"error": "This video is unavailable or has been deleted."}), 404
        else:
            print(f"yt-dlp error: {error_message}")
            return jsonify({"error": f"Could not retrieve video information. Please check the URL or try another one. Details: {error_message}"}), 500
    except Exception as e:
        print(f"General error: {e}")
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

@app.route('/download_video', methods=['POST'])
def download_video():
    data = request.get_json()
    video_url = data.get('url')
    format_id = data.get('format_id')
    file_ext = data.get('ext') # This is the desired output extension (e.g., 'mp4', 'mp3')
    video_title = data.get('title', 'video')

    if not video_url or not format_id or not file_ext:
        return jsonify({"error": "Missing URL, format_id, or file extension"}), 400

    sanitized_title = re.sub(r'[^\w\s-]', '', video_title).strip().replace(' ', '_')
    if not sanitized_title:
        sanitized_title = "download"

    unique_id = uuid.uuid4().hex[:8]
    download_filename = f"{sanitized_title}_{unique_id}.{file_ext}" # Final filename based on requested ext
    filepath = os.path.join(DOWNLOAD_DIR, download_filename)

    try:
        # --- START OF PROXY ADDITION FOR download_video ---
        proxy_url = os.environ.get('PROXY_URL')
        
        ydl_opts = {
            'outtmpl': filepath,
            'no_warnings': True,
            'quiet': True,
            'cachedir': False,
            'noplaylist': True,
            'postprocessors': [] # Initialize postprocessors list
        }
        
        if proxy_url:
            ydl_opts['proxy'] = proxy_url
            print(f"DEBUG: Using proxy for download_video: {proxy_url}") # For debugging in Render logs
        # --- END OF PROXY ADDITION FOR download_video ---

        # Handle video + audio merging for MP4 explicitly
        if file_ext == 'mp4':
            # This format string tells yt-dlp to get the specified video format_id
            # and then merge it with the best available audio (m4a preferred).
            # If the format_id itself is for a combined stream, this still works.
            ydl_opts['format'] = f'{format_id}+bestaudio[ext=m4a]/best'
            ydl_opts['merge_output_format'] = 'mp4'
            ydl_opts['postprocessors'].append({
                'key': 'FFmpegVideoConvertor',
                'preferedformat': 'mp4'
            })
        elif file_ext == 'mp3':
            # For MP3 conversion, we need to extract audio
            ydl_opts['format'] = format_id if 'audio' in format_id.lower() else 'bestaudio/best'
            ydl_opts['postprocessors'].append({
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            })
            ydl_opts['merge_output_format'] = 'mp3' # Ensure final merged output is mp3
        else: # For other audio types like m4a, webm
            ydl_opts['format'] = format_id
            ydl_opts['merge_output_format'] = file_ext


        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # yt-dlp's extract_info with download=True will return the final file path
            info_dict = ydl.extract_info(video_url, download=True)
            final_filepath = ydl.prepare_filename(info_dict) # Get the final name yt-dlp decided

        # Ensure the file is ready before sending
        if not os.path.exists(final_filepath):
            raise Exception(f"Downloaded file not found on server at {final_filepath}.")

        response = send_file(final_filepath, as_attachment=True, download_name=download_filename)

        def cleanup_file_delayed(path_to_clean):
            if os.path.exists(path_to_clean):
                try:
                    os.remove(path_to_clean)
                    print(f"Cleaned up: {path_to_clean}")
                except OSError as e:
                    print(f"Error cleaning up file {path_to_clean}: {e}")

        threading.Timer(10, cleanup_file_delayed, args=[final_filepath]).start()

        return response

    except yt_dlp.DownloadError as e:
        error_message = str(e)
        # Attempt to clean up even if partially downloaded or if there was an error path
        if os.path.exists(filepath): # Original outtmpl path
            try: os.remove(filepath)
            except OSError: pass
        
        if "FFmpeg" in error_message:
            return jsonify({"error": "FFmpeg is required for this download. Please ensure it's installed and in your system PATH."}), 500
        if "age-restricted" in error_message:
            return jsonify({"error": "This video is age-restricted and cannot be downloaded directly."}), 403
        elif "private" in error_message:
            return jsonify({"error": "This video is private and cannot be accessed."}), 403
        elif "unavailable" in error_message or "deleted" in error_message:
            return jsonify({"error": "This video is unavailable or has been deleted."}), 404
        elif "No such format" in error_message:
            return jsonify({"error": "The requested format is not available for this video."}), 400
        else:
            print(f"yt-dlp download error: {error_message}")
            return jsonify({"error": f"Failed to download video. Details: {error_message}"}), 500
    except Exception as e:
        print(f"General download error: {e}")
        if os.path.exists(filepath):
            try: os.remove(filepath)
            except OSError: pass
        return jsonify({"error": f"An unexpected error occurred during download: {str(e)}"}), 500

@app.route('/download_timestamped_video', methods=['POST'])
def download_timestamped_video():
    data = request.get_json()
    video_url = data.get('url')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    video_title = data.get('title', 'video')

    if not video_url or not start_time or not end_time:
        return jsonify({"error": "Missing URL, start time, or end time"}), 400

    sanitized_title = re.sub(r'[^\w\s-]', '', video_title).strip().replace(' ', '_')
    if not sanitized_title:
        sanitized_title = "download"

    unique_id = uuid.uuid4().hex[:8]
    download_filename = f"{sanitized_title}_segment_{unique_id}.mp4" 
    filepath = os.path.join(DOWNLOAD_DIR, download_filename)

    try:
        # --- START OF PROXY ADDITION FOR download_timestamped_video ---
        proxy_url = os.environ.get('PROXY_URL')
        
        ydl_opts = {
            'format': 'bestvideo+bestaudio/best', # Use best available for segment
            'outtmpl': filepath,
            'merge_output_format': 'mp4', # Force mp4 output for segments
            'no_warnings': True,
            'quiet': True,
            'cachedir': False,
            'noplaylist': True,
            'postprocessors': [{
                'key': 'FFmpegPostprocessor',
                'args': [
                    '-ss', str(start_time),  # Start time
                    '-to', str(end_time)     # End time
                ]
            }],
        }
        
        if proxy_url:
            ydl_opts['proxy'] = proxy_url
            print(f"DEBUG: Using proxy for download_timestamped_video: {proxy_url}") # For debugging in Render logs
        # --- END OF PROXY ADDITION FOR download_timestamped_video ---

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # yt-dlp will handle the segment extraction and save to filepath
            ydl.download([video_url])

        if not os.path.exists(filepath):
            raise Exception("Downloaded segment file not found on server.")

        response = send_file(filepath, as_attachment=True, download_name=download_filename)

        def cleanup_file_delayed(path_to_clean):
            if os.path.exists(path_to_clean):
                try:
                    os.remove(path_to_clean)
                    print(f"Cleaned up: {path_to_clean}")
                except OSError as e:
                    print(f"Error cleaning up file {path_to_clean}: {e}")

        threading.Timer(10, cleanup_file_delayed, args=[filepath]).start()

        return response

    except yt_dlp.DownloadError as e:
        error_message = str(e)
        if os.path.exists(filepath):
            try: os.remove(filepath)
            except OSError: pass
        
        if "FFmpeg" in error_message:
            return jsonify({"error": "FFmpeg is required for timestamped downloads. Please ensure it's installed and in your system PATH."}), 500
        return jsonify({"error": f"Failed to download video segment. Details: {error_message}"}), 500
    except Exception as e:
        print(f"General download error for segment: {e}")
        if os.path.exists(filepath):
            try: os.remove(filepath)
            except OSError: pass
        return jsonify({"error": f"An unexpected error occurred during segment download: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
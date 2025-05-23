from flask import Flask, request, jsonify, send_file, render_template, Response
import os
import re
from datetime import datetime
import traceback
import time
from urllib.parse import urlparse, parse_qs
import logging
import sys
import yt_dlp
import json
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('app.log')
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Create download folder if it doesn't exist
DOWNLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'downloads')
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

def clean_youtube_url(url):
    """Clean and standardize YouTube URL format."""
    try:
        # Remove any query parameters and clean the URL
        parsed_url = urlparse(url)
        if 'youtu.be' in parsed_url.netloc:
            video_id = parsed_url.path[1:]  # Remove leading slash
            return f'https://www.youtube.com/watch?v={video_id}'
        elif 'youtube.com' in parsed_url.netloc:
            query_params = parse_qs(parsed_url.query)
            if 'v' in query_params:
                return f'https://www.youtube.com/watch?v={query_params["v"][0]}'
        return url
    except Exception as e:
        logger.error(f"Error cleaning URL: {str(e)}")
        return url

def is_valid_youtube_url(url):
    """Validate YouTube URL format."""
    try:
        youtube_regex = r'(https?://)?(www\.)?(youtube|youtu|youtube-nocookie)\.(com|be)/(watch\?v=|embed/|v/|.+\?v=)?([^&=%\?]{11})'
        return bool(re.match(youtube_regex, url))
    except Exception as e:
        logger.error(f"Error validating URL: {str(e)}")
        return False

def sanitize_filename(filename):
    """Remove invalid characters from filename."""
    try:
        # Remove invalid characters and limit length
        sanitized = re.sub(r'[<>:"/\\|?*]', '', filename)
        return sanitized[:255]  # Limit filename length
    except Exception as e:
        logger.error(f"Error sanitizing filename: {str(e)}")
        return filename

def get_video_info(url):
    """Get video information using yt-dlp."""
    try:
        clean_url = clean_youtube_url(url)
        logger.info(f"Processing URL: {clean_url}")

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-us,en;q=0.5',
                'Sec-Fetch-Mode': 'navigate',
            },
            'format': 'best',
            'nocheckcertificate': True,
            'ignoreerrors': True,
            'no_color': True,
            'geo_bypass': True,
            'geo_verification_proxy': None,
            'socket_timeout': 30,
            'retries': 3,
            'cookiesfrombrowser': None,  # Disable browser cookies
            'extractor_args': {
                'youtube': {
                    'skip': ['dash', 'hls'],
                    'player_client': ['android'],
                    'player_skip': ['js', 'configs', 'webpage'],
                }
            }
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Get video info
                info = ydl.extract_info(clean_url, download=False)
                if not info:
                    raise Exception("Could not extract video information")

                formats = []
                
                # Process video formats
                for f in info.get('formats', []):
                    if f.get('vcodec', 'none') != 'none' and f.get('acodec', 'none') != 'none':
                        format_info = {
                            'format_id': f.get('format_id'),
                            'ext': f.get('ext', 'mp4'),
                            'resolution': f.get('resolution', 'unknown'),
                            'height': f.get('height'),
                            'width': f.get('width'),
                            'fps': f.get('fps'),
                            'vcodec': f.get('vcodec'),
                            'acodec': f.get('acodec'),
                            'vbr': f.get('vbr'),
                            'abr': f.get('abr'),
                            'filesize': f.get('filesize'),
                            'format_note': f.get('format_note', ''),
                            'type': 'video'
                        }
                        formats.append(format_info)
                    elif f.get('acodec', 'none') != 'none' and f.get('vcodec', 'none') == 'none':
                        format_info = {
                            'format_id': f.get('format_id'),
                            'ext': f.get('ext', 'mp3'),
                            'acodec': f.get('acodec'),
                            'abr': f.get('abr'),
                            'filesize': f.get('filesize'),
                            'format_note': f'Audio {f.get("abr", "unknown")}',
                            'type': 'audio'
                        }
                        formats.append(format_info)

                if not formats:
                    raise Exception("No valid formats found for this video")

                return {
                    'success': True,
                    'title': info.get('title', 'Unknown Title'),
                    'author': info.get('uploader', 'Unknown Author'),
                    'thumbnail': info.get('thumbnail', ''),
                    'duration': info.get('duration', 0),
                    'views': info.get('view_count', 0),
                    'formats': formats
                }

        except yt_dlp.utils.DownloadError as e:
            error_message = str(e)
            logger.error(f"Download error: {error_message}")
            
            if "Video unavailable" in error_message:
                return {
                    'success': False,
                    'message': 'This video is unavailable. It may be private or restricted.'
                }
            elif "Video is private" in error_message:
                return {
                    'success': False,
                    'message': 'This video is private. Please use a public video URL.'
                }
            elif "Sign in to confirm your age" in error_message:
                return {
                    'success': False,
                    'message': 'This video requires age verification. Please try a different video.'
                }
            else:
                return {
                    'success': False,
                    'message': f'Error loading video information: {error_message}'
                }

    except Exception as e:
        error_message = str(e)
        logger.error(f"Error in get_video_info: {error_message}\n{traceback.format_exc()}")
        return {
            'success': False,
            'message': f'Error loading video information: {error_message}'
        }

@app.route('/')
def index():
    """Render the main page."""
    return render_template('index.html')

@app.route('/about')
def about():
    """Render the about page."""
    return render_template('about.html')

@app.route('/preview', methods=['POST'])
def preview_video():
    """Get video information for preview."""
    try:
        if not request.is_json:
            return jsonify({'success': False, 'message': 'Invalid request format'}), 400

        data = request.get_json()
        if not data or 'url' not in data:
            return jsonify({'success': False, 'message': 'No URL provided'}), 400

        url = data.get('url', '').strip()
        if not url:
            return jsonify({'success': False, 'message': 'Please provide a YouTube URL'}), 400

        if not is_valid_youtube_url(url):
            return jsonify({'success': False, 'message': 'Invalid YouTube URL format'}), 400

        try:
            video_info = get_video_info(url)
            if video_info and video_info['success']:
                return jsonify(video_info)
            else:
                return jsonify({
                    'success': False,
                    'message': 'Could not load video information. Please try again.'
                }), 400
        except Exception as e:
            error_message = str(e)
            logger.error(f"YouTube API error: {error_message}")
            
            if "Video unavailable" in error_message:
                return jsonify({
                    'success': False,
                    'message': 'This video is unavailable. It may be private or restricted.'
                }), 400
            elif "Video is private" in error_message:
                return jsonify({
                    'success': False,
                    'message': 'This video is private. Please use a public video URL.'
                }), 400
            else:
                return jsonify({
                    'success': False,
                    'message': f'Error loading video information: {error_message}'
                }), 400

    except Exception as e:
        logger.error(f"Preview error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'message': 'Server error occurred'}), 500

@app.route('/download', methods=['POST'])
def download_video():
    """Download YouTube video using yt-dlp and stream directly to client."""
    try:
        if not request.is_json:
            return jsonify({'success': False, 'message': 'Invalid request format'}), 400

        data = request.get_json()
        if not data or 'url' not in data:
            return jsonify({'success': False, 'message': 'No URL provided'}), 400

        url = data.get('url', '').strip()
        format_id = data.get('format_id', 'best')
        extract_audio = data.get('extract_audio', False)

        if not url:
            return jsonify({'success': False, 'message': 'Please provide a YouTube URL'}), 400

        if not is_valid_youtube_url(url):
            return jsonify({'success': False, 'message': 'Invalid YouTube URL format'}), 400

        try:
            clean_url = clean_youtube_url(url)
            logger.info(f"Processing download for URL: {clean_url}")

            # Configure yt-dlp options for direct streaming
            ydl_opts = {
                'format': f'bestaudio/best' if extract_audio else format_id,
                'quiet': True,
                'no_warnings': True,
                'http_headers': {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-us,en;q=0.5',
                    'Sec-Fetch-Mode': 'navigate',
                },
                'nocheckcertificate': True,
                'ignoreerrors': True,
                'no_color': True,
                'geo_bypass': True,
                'geo_verification_proxy': None,
                'socket_timeout': 30,
                'retries': 3,
                'cookiesfrombrowser': None,
                'extractor_args': {
                    'youtube': {
                        'skip': ['dash', 'hls'],
                        'player_client': ['android'],
                        'player_skip': ['js', 'configs', 'webpage'],
                    }
                },
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }] if extract_audio else [],
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Get video info first
                info = ydl.extract_info(clean_url, download=False)
                if not info:
                    raise Exception("Could not extract video information")

                # Get the direct URL for the selected format
                if extract_audio:
                    format_to_download = next((f for f in info['formats'] if f.get('acodec') != 'none' and f.get('vcodec') == 'none'), None)
                else:
                    format_to_download = next((f for f in info['formats'] if f.get('format_id') == format_id), None)

                if not format_to_download:
                    raise Exception("Could not find suitable format")

                # Get the direct URL
                direct_url = format_to_download['url']

                # Set up the response headers
                headers = {
                    'Content-Type': 'audio/mp3' if extract_audio else 'video/mp4',
                    'Content-Disposition': f'attachment; filename="{sanitize_filename(info["title"])}.{"mp3" if extract_audio else "mp4"}"',
                    'Content-Length': str(format_to_download.get('filesize', 0)),
                }

                # Stream the response
                def generate():
                    with requests.get(direct_url, stream=True) as r:
                        r.raise_for_status()
                        for chunk in r.iter_content(chunk_size=8192):
                            if chunk:
                                yield chunk

                return Response(
                    generate(),
                    headers=headers,
                    mimetype='audio/mp3' if extract_audio else 'video/mp4'
                )

        except Exception as e:
            error_message = str(e)
            logger.error(f"YouTube API error: {error_message}\n{traceback.format_exc()}")
            
            if "Video unavailable" in error_message:
                return jsonify({
                    'success': False,
                    'message': 'This video is unavailable. It may be private or restricted.'
                }), 400
            elif "Video is private" in error_message:
                return jsonify({
                    'success': False,
                    'message': 'This video is private. Please use a public video URL.'
                }), 400
            else:
                return jsonify({
                    'success': False,
                    'message': f'Error downloading video: {error_message}'
                }), 400

    except Exception as e:
        logger.error(f"Download error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'message': 'Server error occurred'}), 500

@app.route('/get_file')
def get_file():
    """Send the downloaded file to the client."""
    try:
        filename = request.args.get('filename')
        if not filename:
            return jsonify({'success': False, 'message': 'No filename provided'}), 400

        file_path = os.path.join(DOWNLOAD_FOLDER, filename)
        if not os.path.exists(file_path):
            return jsonify({'success': False, 'message': 'File not found'}), 404

        return send_file(
            file_path,
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        logger.error(f"File retrieval error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'message': 'Error retrieving file'}), 500

if __name__ == '__main__':
    app.run(debug=True)

from flask import Flask, request, jsonify, send_file, render_template
import yt_dlp
import os
import re
from datetime import datetime
import traceback
import time
from urllib.parse import urlparse, parse_qs
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
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

def get_video_info(url, max_retries=3):
    """Get video information with retry mechanism."""
    clean_url = clean_youtube_url(url)
    logger.info(f"Processing URL: {clean_url}")
    
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }
    
    for attempt in range(max_retries):
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(clean_url, download=False)
                
                # Get available formats
                formats = []
                for f in info.get('formats', []):
                    format_info = {
                        'format_id': f.get('format_id'),
                        'ext': f.get('ext', ''),
                        'filesize': f.get('filesize', 0),
                        'format_note': f.get('format_note', ''),
                        'height': f.get('height', 0),
                        'width': f.get('width', 0),
                        'fps': f.get('fps', 0),
                        'vcodec': f.get('vcodec', 'none'),
                        'acodec': f.get('acodec', 'none'),
                    }
                    
                    # Create a descriptive format name
                    format_name = []
                    if format_info['height']:
                        format_name.append(f"{format_info['height']}p")
                    if format_info['fps']:
                        format_name.append(f"{format_info['fps']}fps")
                    if format_info['vcodec'] != 'none':
                        format_name.append('video')
                    if format_info['acodec'] != 'none':
                        format_name.append('audio')
                    
                    format_info['format_name'] = ' '.join(format_name)
                    format_info['quality'] = f"{format_info['height']}p" if format_info['height'] else format_info['format_note']
                    
                    # Only add if it's a video format or audio format
                    if format_info['vcodec'] != 'none' or format_info['acodec'] != 'none':
                        formats.append(format_info)
                
                # Sort formats by height (quality) and type
                formats.sort(key=lambda x: (
                    x['vcodec'] != 'none',  # Video formats first
                    x['height'] or 0,  # Then by height
                    x['fps'] or 0,  # Then by fps
                    x['filesize'] or 0  # Then by filesize
                ), reverse=True)
                
                return {
                    'success': True,
                    'title': info.get('title', ''),
                    'author': info.get('uploader', ''),
                    'duration': info.get('duration', 0),
                    'views': info.get('view_count', 0),
                    'thumbnail': info.get('thumbnail', ''),
                    'formats': formats
                }
        except Exception as e:
            logger.error(f"Attempt {attempt + 1} failed: {str(e)}")
            if attempt == max_retries - 1:
                raise e
            time.sleep(2)
    return None

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
    """Download YouTube video."""
    try:
        if not request.is_json:
            return jsonify({'success': False, 'message': 'Invalid request format'}), 400

        data = request.get_json()
        if not data or 'url' not in data:
            return jsonify({'success': False, 'message': 'No URL provided'}), 400

        url = data.get('url', '').strip()
        format_id = data.get('format_id', 'best')

        if not url:
            return jsonify({'success': False, 'message': 'Please provide a YouTube URL'}), 400

        if not is_valid_youtube_url(url):
            return jsonify({'success': False, 'message': 'Invalid YouTube URL format'}), 400

        try:
            clean_url = clean_youtube_url(url)
            logger.info(f"Processing download for URL: {clean_url}")
            
            # Configure yt-dlp options
            ydl_opts = {
                'format': format_id,
                'outtmpl': os.path.join(DOWNLOAD_FOLDER, '%(title)s.%(ext)s'),
                'quiet': True,
                'no_warnings': True,
            }

            # Download the video
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(clean_url, download=True)
                output_filename = ydl.prepare_filename(info)

            logger.info(f"Successfully downloaded video to: {output_filename}")

            return jsonify({
                'success': True,
                'message': 'Download completed successfully',
                'filename': os.path.basename(output_filename)
            })

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

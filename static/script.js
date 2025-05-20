document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('download-form');
    const videoPreview = document.getElementById('video-preview');
    const urlInput = document.getElementById('url');
    const thumbnail = document.getElementById('thumbnail');
    const videoTitle = document.getElementById('video-title');
    const author = document.getElementById('author');
    const duration = document.getElementById('duration');
    const views = document.getElementById('views');
    const qualitySelect = document.getElementById('quality');
    const downloadBtn = document.getElementById('download-btn');
    const status = document.getElementById('status');
    const progressContainer = document.getElementById('progress-container');
    const progress = document.getElementById('progress');
    const convertBtn = document.querySelector('.convert-btn');

    // Hide video preview initially
    videoPreview.classList.remove('show');

    function showStatus(message, type) {
        status.textContent = message;
        status.className = 'status ' + type;
        // Scroll status into view if it's not visible
        status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function updateProgress(percent) {
        progress.style.width = percent + '%';
    }

    function setLoading(isLoading) {
        if (isLoading) {
            convertBtn.disabled = true;
            convertBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            convertBtn.style.opacity = '0.7';
        } else {
            convertBtn.disabled = false;
            convertBtn.innerHTML = '<i class="fas fa-download"></i> Convert';
            convertBtn.style.opacity = '1';
        }
    }

    function formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    function formatViews(views) {
        if (views >= 1000000) {
            return (views / 1000000).toFixed(1) + 'M views';
        } else if (views >= 1000) {
            return (views / 1000).toFixed(1) + 'K views';
        }
        return views + ' views';
    }

    function formatFileSize(bytes) {
        if (!bytes) return 'Unknown size';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
    }

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const url = urlInput.value.trim();
        
        if (!url) {
            showStatus('Please enter a YouTube URL', 'error');
            return;
        }

        try {
            // Set loading state
            setLoading(true);
            
            // Show initial processing status
            showStatus('⏳ Please wait while we process your video...', 'info');
            progressContainer.classList.remove('hidden');
            updateProgress(10);

            // Validate URL format
            if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
                throw new Error('Invalid YouTube URL format');
            }

            showStatus('🔍 Fetching video information... Please wait', 'info');
            updateProgress(30);

            const response = await fetch('/preview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: url })
            });

            showStatus('⚙️ Processing video details... This may take a moment', 'info');
            updateProgress(60);

            const data = await response.json();

            if (!data.success) {
                showStatus(data.message || 'Error loading video information', 'error');
                progressContainer.classList.add('hidden');
                setLoading(false);
                return;
            }

            // Update video information
            showStatus('📥 Loading video preview... Almost done!', 'info');
            updateProgress(80);

            thumbnail.src = data.thumbnail;
            videoTitle.textContent = data.title;
            author.textContent = data.author;
            duration.textContent = formatDuration(data.duration);
            views.textContent = formatViews(data.views);

            // Update quality options
            qualitySelect.innerHTML = '';
            
            // Add video formats
            const videoFormats = data.formats.filter(f => f.type === 'video' && f.format_note);
            if (videoFormats.length > 0) {
                const videoGroup = document.createElement('optgroup');
                videoGroup.label = 'Video Formats';
                
                // Sort video formats by quality (highest first)
                videoFormats.sort((a, b) => {
                    const qualityA = parseInt(a.format_note) || 0;
                    const qualityB = parseInt(b.format_note) || 0;
                    return qualityB - qualityA;
                });

                videoFormats.forEach(format => {
                    const option = document.createElement('option');
                    option.value = format.format_id;
                    const quality = format.format_note || 'Unknown';
                    const fps = format.fps ? ` ${format.fps}fps` : '';
                    const size = format.filesize ? ` (${formatFileSize(format.filesize)})` : '';
                    option.textContent = `${quality}p${fps} - ${format.ext.toUpperCase()}${size}`;
                    videoGroup.appendChild(option);
                });
                qualitySelect.appendChild(videoGroup);
            }

            // Add audio formats
            const audioFormats = data.formats.filter(f => f.type === 'audio');
            if (audioFormats.length > 0) {
                const audioGroup = document.createElement('optgroup');
                audioGroup.label = 'Audio Formats';
                
                // Sort audio formats by quality (highest first)
                audioFormats.sort((a, b) => {
                    const qualityA = parseInt(a.abr) || 0;
                    const qualityB = parseInt(b.abr) || 0;
                    return qualityB - qualityA;
                });

                audioFormats.forEach(format => {
                    const option = document.createElement('option');
                    option.value = format.format_id;
                    const quality = format.abr ? `${format.abr}kbps` : 'Unknown';
                    const size = format.filesize ? ` (${formatFileSize(format.filesize)})` : '';
                    option.textContent = `${quality} - ${format.ext.toUpperCase()}${size}`;
                    audioGroup.appendChild(option);
                });
                qualitySelect.appendChild(audioGroup);
            }

            // Show video preview
            videoPreview.classList.add('show');
            updateProgress(100);
            showStatus('✅ Video information loaded successfully! Select quality and click Download to start.', 'success');
            
            // Hide progress bar after success
            setTimeout(() => {
                progressContainer.classList.add('hidden');
            }, 1000);

        } catch (error) {
            console.error('Error:', error);
            showStatus('❌ ' + (error.message || 'Error loading video information. Please try again.'), 'error');
            progressContainer.classList.add('hidden');
        } finally {
            setLoading(false);
        }
    });

    downloadBtn.addEventListener('click', async function() {
        const url = urlInput.value.trim();
        const formatId = qualitySelect.value;

        if (!url) {
            showStatus('Please enter a YouTube URL', 'error');
            return;
        }

        try {
            showStatus('⏳ Preparing download... Please wait', 'info');
            progressContainer.classList.remove('hidden');
            updateProgress(10);

            const response = await fetch('/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    url: url,
                    format_id: formatId
                })
            });

            showStatus('📥 Downloading video... This may take a while', 'info');
            updateProgress(50);

            if (!response.ok) {
                throw new Error('Download failed');
            }

            showStatus('⚙️ Processing video file... Almost done!', 'info');
            updateProgress(80);

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = 'video.' + (formatId === 'best' ? 'mp4' : 'mp3');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);

            updateProgress(100);
            showStatus('✅ Download completed successfully!', 'success');
            
            // Hide progress bar after success
            setTimeout(() => {
                progressContainer.classList.add('hidden');
            }, 1000);

        } catch (error) {
            console.error('Error:', error);
            showStatus('❌ Error downloading video. Please try again.', 'error');
            progressContainer.classList.add('hidden');
        }
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});
  
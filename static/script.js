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
                throw new Error(data.message || 'Error loading video information');
            }

            // Update video information
            showStatus('📥 Loading video preview... Almost done!', 'info');
            updateProgress(80);

            thumbnail.src = data.thumbnail;
            videoTitle.textContent = data.title;
            author.textContent = data.author;
            duration.textContent = formatDuration(data.duration);
            views.textContent = formatViews(data.views);

            // Process all formats
            const formats = data.formats;
            console.log('All available formats:', formats);
            
            // Group formats by type
            const videoWithAudio = formats.filter(f => f.type === 'video' && f.acodec !== 'none');
            const videoOnly = formats.filter(f => f.type === 'video' && f.acodec === 'none');
            const audioOnly = formats.filter(f => f.type === 'audio');
            
            console.log('Video with Audio:', videoWithAudio);
            console.log('Video Only:', videoOnly);
            console.log('Audio Only:', audioOnly);
            
            // Clear existing options
            qualitySelect.innerHTML = '';
            
            // Add Video with Audio formats
            if (videoWithAudio.length > 0) {
                const videoGroup = document.createElement('optgroup');
                videoGroup.label = '🎥 Video with Audio';
                
                // Sort video formats by quality
                videoWithAudio.sort((a, b) => {
                    // First sort by height
                    const heightA = a.height || 0;
                    const heightB = b.height || 0;
                    if (heightB !== heightA) return heightB - heightA;
                    
                    // Then by fps
                    const fpsA = a.fps || 0;
                    const fpsB = b.fps || 0;
                    if (fpsB !== fpsA) return fpsB - fpsA;
                    
                    // Then by bitrate
                    const vbrA = a.vbr || 0;
                    const vbrB = b.vbr || 0;
                    return vbrB - vbrA;
                });

                // Add each video format
                videoWithAudio.forEach(format => {
                    const option = document.createElement('option');
                    option.value = format.format_id;
                    
                    // Build format description
                    let formatDesc = [];
                    
                    // Resolution
                    if (format.height) {
                        let quality = '';
                        if (format.height >= 2160) quality = '4K';
                        else if (format.height >= 1440) quality = '2K';
                        else if (format.height >= 1080) quality = '1080p';
                        else if (format.height >= 720) quality = '720p';
                        else if (format.height >= 480) quality = '480p';
                        else if (format.height >= 360) quality = '360p';
                        else if (format.height >= 240) quality = '240p';
                        else if (format.height >= 144) quality = '144p';
                        formatDesc.push(quality);
                    }
                    
                    // FPS
                    if (format.fps) {
                        formatDesc.push(`${format.fps}fps`);
                    }
                    
                    // Codec
                    if (format.vcodec && format.vcodec !== 'none') {
                        const codec = format.vcodec.split('.')[0]; // Get main codec name
                        formatDesc.push(codec);
                    }
                    
                    // Bitrate
                    if (format.vbr) {
                        formatDesc.push(`${Math.round(format.vbr)}kbps`);
                    }
                    
                    // Extension
                    if (format.ext) {
                        formatDesc.push(format.ext.toUpperCase());
                    }
                    
                    // File size
                    if (format.filesize) {
                        formatDesc.push(`(${formatFileSize(format.filesize)})`);
                    }
                    
                    option.textContent = formatDesc.join(' • ');
                    videoGroup.appendChild(option);
                });
                qualitySelect.appendChild(videoGroup);
            }

            // Add Video Only formats
            if (videoOnly.length > 0) {
                const videoOnlyGroup = document.createElement('optgroup');
                videoOnlyGroup.label = '🎬 Video Only';
                
                // Sort video formats by quality
                videoOnly.sort((a, b) => {
                    const heightA = a.height || 0;
                    const heightB = b.height || 0;
                    if (heightB !== heightA) return heightB - heightA;
                    
                    const fpsA = a.fps || 0;
                    const fpsB = b.fps || 0;
                    if (fpsB !== fpsA) return fpsB - fpsA;
                    
                    const vbrA = a.vbr || 0;
                    const vbrB = b.vbr || 0;
                    return vbrB - vbrA;
                });

                videoOnly.forEach(format => {
                    const option = document.createElement('option');
                    option.value = format.format_id;
                    
                    let formatDesc = [];
                    
                    if (format.height) {
                        let quality = '';
                        if (format.height >= 2160) quality = '4K';
                        else if (format.height >= 1440) quality = '2K';
                        else if (format.height >= 1080) quality = '1080p';
                        else if (format.height >= 720) quality = '720p';
                        else if (format.height >= 480) quality = '480p';
                        else if (format.height >= 360) quality = '360p';
                        else if (format.height >= 240) quality = '240p';
                        else if (format.height >= 144) quality = '144p';
                        formatDesc.push(quality);
                    }
                    
                    if (format.fps) {
                        formatDesc.push(`${format.fps}fps`);
                    }
                    
                    if (format.vcodec && format.vcodec !== 'none') {
                        const codec = format.vcodec.split('.')[0];
                        formatDesc.push(codec);
                    }
                    
                    if (format.vbr) {
                        formatDesc.push(`${Math.round(format.vbr)}kbps`);
                    }
                    
                    if (format.ext) {
                        formatDesc.push(format.ext.toUpperCase());
                    }
                    
                    if (format.filesize) {
                        formatDesc.push(`(${formatFileSize(format.filesize)})`);
                    }
                    
                    option.textContent = formatDesc.join(' • ');
                    videoOnlyGroup.appendChild(option);
                });
                qualitySelect.appendChild(videoOnlyGroup);
            }

            // Add Audio Only formats
            if (audioOnly.length > 0) {
                const audioGroup = document.createElement('optgroup');
                audioGroup.label = '🎵 Audio Only';
                
                // Sort audio formats by quality
                audioOnly.sort((a, b) => {
                    const qualityA = parseInt(a.abr) || 0;
                    const qualityB = parseInt(b.abr) || 0;
                    return qualityB - qualityA;
                });

                audioOnly.forEach(format => {
                    const option = document.createElement('option');
                    option.value = format.format_id;
                    
                    let formatDesc = [];
                    
                    // Quality label
                    const abr = parseInt(format.abr) || 0;
                    if (abr >= 192) {
                        formatDesc.push('High Quality');
                    } else if (abr >= 128) {
                        formatDesc.push('Medium Quality');
                    } else {
                        formatDesc.push('Standard Quality');
                    }
                    
                    // Bitrate
                    if (format.abr) {
                        formatDesc.push(`${format.abr}kbps`);
                    }
                    
                    // Codec
                    if (format.acodec && format.acodec !== 'none') {
                        const codec = format.acodec.split('.')[0];
                        formatDesc.push(codec);
                    }
                    
                    // Extension
                    if (format.ext) {
                        formatDesc.push(format.ext.toUpperCase());
                    }
                    
                    // File size
                    if (format.filesize) {
                        formatDesc.push(`(${formatFileSize(format.filesize)})`);
                    }
                    
                    option.textContent = formatDesc.join(' • ');
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
        const isAudioOnly = qualitySelect.selectedOptions[0].parentElement.label === '🎵 Audio Only';

        if (!url) {
            showStatus('Please enter a YouTube URL', 'error');
            return;
        }

        try {
            // Disable download button and show loading state
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
            
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
                    format_id: formatId,
                    extract_audio: isAudioOnly
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Download failed');
            }

            showStatus('📥 Downloading... This may take a while', 'info');
            updateProgress(50);

            // Get the blob from the response
            const blob = await response.blob();
            
            if (blob.size === 0) {
                throw new Error('Downloaded file is empty');
            }

            showStatus('⚙️ Processing file... Almost done!', 'info');
            updateProgress(80);

            // Create a download link
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            
            // Get filename from response headers or use default
            const contentDisposition = response.headers.get('content-disposition');
            let filename = isAudioOnly ? 'audio.mp3' : 'video.mp4';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
            
            a.download = filename;
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
            showStatus('❌ ' + (error.message || 'Error downloading. Please try again.'), 'error');
            progressContainer.classList.add('hidden');
        } finally {
            // Re-enable download button and restore original text
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
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

    // Theme Toggle Functionality
    const themeToggle = document.getElementById('theme-toggle');
    const icon = themeToggle.querySelector('i');

    // Check for saved theme preference or default to dark
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateIcon(savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateIcon(newTheme);
    });

    function updateIcon(theme) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
});
  
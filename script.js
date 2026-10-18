let html5QrcodeScanner = null;
let isScanning = false;

// Initialize the QR code scanner
function startScanning() {
    const startBtn = document.getElementById('startScan');
    const stopBtn = document.getElementById('stopScan');
    const messageDiv = document.getElementById('message');

    startBtn.disabled = true;
    startBtn.innerHTML = '<span class="inline-block w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin mr-2 align-middle"></span>Starting camera...';

    html5QrcodeScanner = new Html5Qrcode("reader");

    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };

    html5QrcodeScanner.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanFailure
    ).then(() => {
        isScanning = true;
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        stopBtn.disabled = false;
        showMessage('Camera active. Point at a QR code to scan.', 'info');
    }).catch((err) => {
        console.error('Error starting scanner:', err);
        startBtn.disabled = false;
        startBtn.innerHTML = '📷 Start Camera';
        showMessage('Failed to start camera. Please ensure camera permissions are granted.', 'error');
    });
}

// Stop the QR code scanner
function stopScanning() {
    if (html5QrcodeScanner && isScanning) {
        html5QrcodeScanner.stop().then(() => {
            isScanning = false;
            document.getElementById('startScan').classList.remove('hidden');
            document.getElementById('startScan').disabled = false;
            document.getElementById('startScan').innerHTML = '📷 Start Camera';
            document.getElementById('stopScan').classList.add('hidden');
            showMessage('Camera stopped.', 'info');
        }).catch((err) => {
            console.error('Error stopping scanner:', err);
            showMessage('Error stopping camera.', 'error');
        });
    }
}

// Handle successful QR code scan
function onScanSuccess(decodedText, decodedResult) {
    console.log('Scan successful:', decodedText);

    // Pause scanning temporarily
    if (html5QrcodeScanner && isScanning) {
        html5QrcodeScanner.pause();
    }

    try {
        // Parse the JSON payload
        const prescriptionData = JSON.parse(decodedText);

        // Validate required fields
        if (!prescriptionData.med || !prescriptionData.dose || !prescriptionData.duration) {
            throw new Error('Invalid QR code format. Required fields: med, dose, duration');
        }

        // Display the prescription data
        displayPrescription(prescriptionData);

        // Send to backend
        savePrescription(prescriptionData);

    } catch (error) {
        console.error('Error parsing QR code:', error);
        showMessage('Invalid QR code format. Expected JSON with med, dose, and duration fields.', 'error');

        // Resume scanning after a delay
        setTimeout(() => {
            if (html5QrcodeScanner && isScanning) {
                html5QrcodeScanner.resume();
            }
        }, 3000);
    }
}

// Handle scan failure (continuous)
function onScanFailure(error) {
    // This is called continuously when no QR code is detected
    // We can ignore this to avoid console spam
}

// Display prescription data in the UI
function displayPrescription(data) {
    document.getElementById('medValue').textContent = data.med;
    document.getElementById('doseValue').textContent = data.dose;
    document.getElementById('durationValue').textContent = data.duration;
    document.getElementById('prescriptionCard').classList.remove('hidden');
}

// Save prescription to backend
async function savePrescription(data) {
    const messageDiv = document.getElementById('message');
    showMessage('Saving prescription...', 'info');

    try {
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Save successful:', result);
        showMessage('✅ Prescription saved successfully!', 'success');

        // Resume scanning after successful save
        setTimeout(() => {
            if (html5QrcodeScanner && isScanning) {
                html5QrcodeScanner.resume();
            }
        }, 2000);

    } catch (error) {
        console.error('Error saving prescription:', error);
        showMessage('❌ Failed to save prescription. Please try again.', 'error');

        // Resume scanning after error
        setTimeout(() => {
            if (html5QrcodeScanner && isScanning) {
                html5QrcodeScanner.resume();
            }
        }, 3000);
    }
}

// Display message to user
function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.classList.remove('hidden');
    messageDiv.classList.add('block');

    // Reset all type classes
    messageDiv.classList.remove('bg-green-100', 'text-green-800', 'border-green-200',
                               'bg-red-100', 'text-red-800', 'border-red-200',
                               'bg-blue-100', 'text-blue-800', 'border-blue-200');

    if (type === 'success') {
        messageDiv.classList.add('bg-green-100', 'text-green-800', 'border', 'border-green-200');
    } else if (type === 'error') {
        messageDiv.classList.add('bg-red-100', 'text-red-800', 'border', 'border-red-200');
    } else {
        messageDiv.classList.add('bg-blue-100', 'text-blue-800', 'border', 'border-blue-200');
    }

    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            messageDiv.classList.add('hidden');
            messageDiv.classList.remove('block');
        }, 5000);
    }
}

// Handle page unload to stop scanner
window.addEventListener('beforeunload', () => {
    if (html5QrcodeScanner && isScanning) {
        html5QrcodeScanner.stop().catch(console.error);
    }
});

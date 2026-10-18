"""
Generate a sample prescription QR code for testing.
"""

import qrcode
import json

# Sample prescription data
prescription_data = {
    "med": "Amoxicillin",
    "dose": "500mg",
    "duration": "7 days"
}

# Convert to JSON string
json_data = json.dumps(prescription_data)

# Generate QR code
qr = qrcode.QRCode(
    version=1,
    error_correction=qrcode.constants.ERROR_CORRECT_L,
    box_size=10,
    border=4,
)
qr.add_data(json_data)
qr.make(fit=True)

# Create and save the QR code image
img = qr.make_image(fill_color="black", back_color="white")
img.save("prescription_qr.png")

print(f"QR code generated successfully!")
print(f"Data: {json_data}")
print(f"Saved as: prescription_qr.png")

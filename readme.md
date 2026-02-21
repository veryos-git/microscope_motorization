
# installation 
## install deno (js)
### mac os / linux 
curl -fsSL https://deno.land/install.sh | sh
### windows
irm https://deno.land/install.ps1 | iex


## run `deno -A startup.js`
## find out ESP32 IP adress
start the serial mointor of the arduino IDE application 
![alt text](build_guide/start_software2.png)
after that , go to http://localhost:8000
![alt text](build_guide/find_out_esp32_ip.png)
if you see question marks, set the correct baud rate and click the 'RET' button on the ESP32
you should see the IP of the ESP32
![alt text](build_guide/find_out_esp32_ip_after_pressing_ret_button.png)
---

# microscope motorization
this is the software used to run the xy table (z optional ) for the 3d printable microscope motorization
download the 3d printable files here
https://makerworld.com/en/models/2389756-microscope-motorized-xy-table-28byj-48#profileId-2617806




# this project in short 
Project: Low-cost, open-source microscope automation. A fully 3D-printed XY-stage powered by an ESP32 and 28BYJ-48 stepper motors, assembled in ~3 hours. Controlled via web app (WebSocket), keyboard, game controllers (e.g. PS4 DualShock), or programmable API, it enables local or remote automated slide scanning using a microscope camera as a webcam. The system requires only four M3 screws in addition to widely available electronics (ESP32, ULN2003 drivers, motors). All structural parts are 3D printed and field-replaceable, allowing independent production and repair even in remote locations. Designed as a 99.75% lower-cost alternative to commercial systems, it democratizes lab automation for education, DIY biology, and resource-limited laboratories


# stepper motor info 
Description
Reviews (0)
Stepper Motor 5V 1/64 (28BYJ-48)
This unipolar stepper motor is perfect for small craft projects with motors. The stepper motor can be easily connected via a plug connection to a stepper motor driver module. In our shop, we have various stepper motor drivers (ULN2003) on offer that fit this motor. The stepper motor has a gearbox with a ratio of 1:64 this gear ratio has a certain deviation. If the motor is always turned in the same direction, for example in a clock, a fault can occur. This fault can be compensated if the position is sporadically determined anew with a light barrier module. This also has the advantage that the start position of the stepper motor can be precisely determined when it is switched on for the first time.

Connections:
5-Pin Connector
Technical Details:
Operating voltage: 5V DC
Operating voltage: 5V
Phases: 4
Step angle: 5.625° (64 steps/revolution)
DC resistance : 50 Ω
Noise level: 40 dB
Torque: > 34.3mNm
Gear ratio: 1/64
Motor diameter: 28mm
Motor shaft: Ø 5mm
Motor shaft length: 8mm
Mounting hole distance: 35mm
Weight: 38g
Delivery Includes:
1x Stepper Motor 28BYJ-48 with connection cable
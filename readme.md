# microscope motorization

this is the software used to run the xy table (z optional ) for the 3d printable microscope motorization



# how it works

microcontroller (esp32):
    - 3 stepper motors 
        (28BYJ-48 Stepper motor 5V DC + ULN2003A driver board)
    - connected to wifi 
    - receiving commands via websocket

computer : 
    - running denojs webserver
    - client javascript connecting to esp32 websocket
    - sending commands to control the microscope
    - recording data
        - storing x y z data
    - has usb microscope camera attached
        - reads camera image 
    

# installation 
i want to be able to make the installation of this software as easy as possible so i want to have all in one startup/installation script. so the end user only needs to run one command


## install deno (js)

### run deno -A startup.js


# demo 
<video controls src="demo/WhatsApp Video 2026-02-12 at 21.39.57.mp4" title="Title"></video>

# demo with webapplication
<video controls src="demo/WhatsApp Video 2026-02-12 at 21.40.17.mp4" title="Title"></video>
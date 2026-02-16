i want to be able to make the installation of this software as easy as possible so i want to have all in one startup / installation script. so the end user only needs to run one command
the user only needs to install deno js , the installation script then checks with (Deno.command?) if any other binary like esptool has to be installed
---
next step is to improve the software. there should be a feature that visualizes the movement on a canvas. it shows the trace of where the center 'passed'. and it somehow is like a minimap in a computer game, it provides an overview of the xy cartesian system. later if a webcam is implemented , the images could also be stitched and used as a background on this 'minimap'. 

---
the flow of the application is the following 
 user should start web application 
 user should land on the start page where user can set the pins for motor 'x' and motor 'y'
 user should be able to generate a code 
 user should be able to see if a esp32 is connected or not
 user should be able to flash the esp32 
 the flashing process should be mointored
 after the esp32 is flashed user should be taken to the microscope controll gui webpage

 if the user starts the webapp and a esp32 is already connected the user should be taken to the microscope controll page 
 
# InkMe-3D 👕

InkMe-3D is a web application that allows users to **design and customize
3D t-shirts directly in the browser** with a real-time interactive
experience.

The application uses **WebGL through Three.js** to render 3D models and
allows users to change colors, upload images, or add designs to products,
while viewing the design from multiple angles before ordering.

The project focuses on building a **visual, high-performance, and smooth
interactive experience on the web platform**.

------------------------------------------------------------------------

# Demo

Live Demo:\
https://inkme3d.com

Preview:

![Preview](./public/demo.png)

------------------------------------------------------------------------

# Key Features

### 3D Product Customization

-   Change shirt colors directly on the 3D model
-   Upload images to print on the shirt
-   Real-time result preview

### Interactive 3D Model Viewer

-   Rotate, zoom, and inspect products from multiple angles
-   Dynamic lighting and camera system
-   Smooth interaction on the browser

### Performance Optimization

-   3D model optimization from Blender
-   Resource reduction to ensure render speed
-   Maintain smooth experience when interacting with models

------------------------------------------------------------------------

# Technologies

## Frontend

-   React
-   Three.js
-   React Three Fiber
-   Tailwind CSS

## 3D Technology

-   WebGL
-   Three.js
-   Blender

## Development Tools

-   Vite
-   Git / GitHub
-   npm

------------------------------------------------------------------------

# Project Structure

    src
     ├── components        # UI components
     ├── canvas            # 3D scene and model rendering
     ├── pages             # Application pages
     ├── assets            # Images and 3D models
     ├── utils             # Helper functions
     └── App.jsx

------------------------------------------------------------------------

# 3D Rendering Pipeline

1.  User uploads an image or changes the color\
2.  Texture is processed and applied to the model\
3.  Three.js re-renders the scene in real-time\
4.  User can interact with the model via camera controls

------------------------------------------------------------------------

# Installation & Setup

## 1. Clone repository

    git clone https://github.com/InkMe-3D/InkMe-3D.git

## 2. Navigate to project directory

    cd InkMe-3D

## 3. Install dependencies

    npm install

## 4. Run the application

    npm run dev

The application will run at:

    http://localhost:5173

------------------------------------------------------------------------

# Project Goals

This project was built to:

-   Explore the capabilities of **3D on the web platform**
-   Develop **intuitive product customization experiences**
-   Research **WebGL performance optimization in React apps**
-   Combine **modern UI with interactive 3D graphics**

------------------------------------------------------------------------

# Future Development

Features that may be developed in the future:

-   Save user designs
-   Integrate an ordering system
-   Add more product types (hoodies, hats, bags)
-   Further optimize mobile render performance
-   Add a product management system

------------------------------------------------------------------------

# Author

**Nguyễn Tiến Đạt**

Frontend Developer (React • Next.js • Three.js)

GitHub\
https://github.com/RinkVN

LinkedIn\
https://linkedin.com/in/datnguyendesign

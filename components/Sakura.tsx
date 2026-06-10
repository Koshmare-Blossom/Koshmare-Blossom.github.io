"use client";

import React, { useEffect, useRef } from 'react';

const Sakura: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let petals: any[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resize);
    resize();

    class Petal {
      x: number;
      y: number;
      size: number;
      horizontalSpeed: number;
      verticalSpeed: number;
      rotation: number;
      rotationSpeed: number;
      opacity: number;
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * (canvas.height + 100) - 100;
        this.size = Math.random() * 5 + 2;
        this.horizontalSpeed = Math.random() * 1 - 0.5;
        this.verticalSpeed = Math.random() * 1 + 0.5;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = Math.random() * 0.02 - 0.01;
        this.opacity = Math.random() * 0.4 + 0.1;
      }
      update() {
        this.y += this.verticalSpeed;
        this.x += this.horizontalSpeed + Math.sin(this.y / 50) * 0.5;
        this.rotation += this.rotationSpeed;
        if (this.y > canvas.height) {
          this.y = -20;
          this.x = Math.random() * canvas.width;
        }
      }
      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(this.size, -this.size, this.size * 2, this.size, 0, this.size * 1.5);
        ctx.bezierCurveTo(-this.size * 2, this.size, -this.size, -this.size, 0, 0);
        ctx.fillStyle = "rgba(255, 183, 197, " + this.opacity + ")";
        ctx.fill();
        ctx.restore();
      }
    }
    const init = () => {
      petals = [];
      for (let i = 0; i < 30; i++) {
        petals.push(new Petal());
      }
    };
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      petals.forEach((petal) => {
        petal.update();
        petal.draw();
      });
      animationFrameId = requestAnimationFrame(animate);
    };
    init();
    animate();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: -1,
        opacity: 0.5,
      }}
    />
  );
};
export default Sakura;

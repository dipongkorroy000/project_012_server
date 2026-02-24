# Freelancing Web App - Microservice Architecture

This project is a **freelancing-style web application** built with **Node.js**, **Firebase**, **Stripe**, and **MongoDB**.  
It supports three roles — **Admin**, **Buyer**, and **Worker** — with secure authentication, task management, and payment integration.

---

## 🛠 Tech Stack

- **Backend**
  - **Node.js** → Server-side runtime for building scalable APIs
  - **Express.js** → Web framework for routing and middleware
  - **MongoDB** → Database for storing users, tasks, and transactions
  - **Mongoose** → ODM for managing MongoDB models
  - **Firebase Auth** → Secure authentication and role management
  - **Stripe** → Payment gateway integration for transactions

- **Frontend**
  - Client-side UI for Buyers, Workers, and Admins

---

## 🔗 Services Overview

- **Admin**
  - Manage platform users (Buyers and Workers)
  - Oversee tasks and payments
  - Monitor system activity

- **Buyer**
  - Create and post tasks/projects
  - Hire Workers for tasks
  - Make secure payments via Stripe

- **Worker**
  - Browse and accept tasks
  - Complete assigned work
  - Receive payments after task completion

---

## 🔐 Authentication Flow

1. User registers or logs in via **Firebase Auth**  
2. Firebase issues a secure token  
3. Backend verifies token and assigns role (Admin, Buyer, Worker)  
4. Role-based access control ensures only authorized actions are allowed  

---

## 💼 Task Management Flow

1. Buyer creates a new task (stored in MongoDB)  
2. Worker browses available tasks  
3. Worker accepts a task → Status updated in database  
4. Upon completion, Buyer verifies and approves  
5. Task marked as completed and payment triggered  

---

## 💳 Payment Integration (Stripe)

1. Buyer initiates payment for a task  
2. Stripe processes the transaction securely  
3. Payment record stored in MongoDB  
4. Worker receives payout after task completion  
5. Admin can monitor all transactions  

---

## 📊 Benefits of This Architecture

- **Scalability** → Node.js + MongoDB handle large numbers of users and tasks  
- **Security** → Firebase Auth ensures safe login and role management  
- **Reliability** → Stripe provides trusted payment processing  
- **Flexibility** → Clear separation of roles (Admin, Buyer, Worker)  

---

## ✅ Summary

- Built with **Node.js**, **Firebase**, **Stripe**, and **MongoDB**  
- Supports three roles: **Admin**, **Buyer**, **Worker**  
- Secure authentication with Firebase  
- Task management stored in MongoDB  
- Stripe integration for payments  
- Role-based workflows for freelancing-style collaboration  

---

## 🚀 Future Improvements

- Add notifications for task updates  
- Implement rating/review system for Workers  
- Enhance Admin dashboard with analytics  
- Support multi-currency payments with Stripe  

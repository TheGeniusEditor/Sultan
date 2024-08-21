const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const hbs = require("hbs");
require('dotenv').config();
const cron = require('node-cron');

const app = express();
const port = process.env.PORT;

// MongoDB Atlas connection
const dbURI = process.env.MONGODB_URI;

mongoose.connect(dbURI, {})
    .then(() => {
        console.log("Connected to MongoDB Atlas");
    })
    .catch((error) => {
        console.error("MongoDB connection error:", error);
    });

// Define schemas and models
const cartSchema = new mongoose.Schema({
    customerName: String,
    tableNumber: String,
    items: [{
        title: String,
        price: String,
        quantity: Number,
        totalItemPrice: String
    }],
    totalPrice: String,
    orderType: String, // Added field for Dine-in or Takeaway
    paymentType: String, // Added field for Payment Type
    createdAt: { type: Date, default: Date.now }
});


const Cart = mongoose.model("Cart", cartSchema);

const earningsRecordSchema = new mongoose.Schema({
    date: String,
    totalEarnings: Number
});

const EarningsRecord = mongoose.model("EarningsRecord", earningsRecordSchema);

// Paths for static files and templates
const static_path = path.join(__dirname, "../public");
const templates_path = path.join(__dirname, "../templates/views");

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(express.static(static_path));
app.set("view engine", "hbs");
app.set("views", templates_path);

// Route for the main page
app.get("/", (req, res) => {
    res.render("main");
});

// Route for the dining page
app.get("/dine", (req, res) => {
    res.render("dine");
});

// Route to handle checkout
app.post("/checkout", async (req, res) => {
    try {
        const { customerName, tableNumber, cartItems, totalPrice, orderType, paymentType } = req.body; // Included paymentType

        // Calculate totalItemPrice for each cart item
        const updatedCartItems = cartItems.map(item => ({
            ...item,
            totalItemPrice: (parseFloat(item.price.replace('₹', '')) * item.quantity).toFixed(2)
        }));

        const newCart = new Cart({
            customerName,
            tableNumber,
            items: updatedCartItems,
            totalPrice,
            orderType, // Save the order type
            paymentType // Save the payment type
        });

        await newCart.save();

        // Save daily earnings
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const earningsRecord = await EarningsRecord.findOne({ date: today });

        if (earningsRecord) {
            earningsRecord.totalEarnings += parseFloat(totalPrice.replace('₹', ''));
            await earningsRecord.save();
        } else {
            const newEarningsRecord = new EarningsRecord({
                date: today,
                totalEarnings: parseFloat(totalPrice.replace('₹', ''))
            });
            await newEarningsRecord.save();
        }

        res.status(200).send("Order successfully placed!");
    } catch (error) {
        console.error("Error saving to MongoDB:", error);
        res.status(500).send("Internal Server Error");
    }
});


// Route for the kitchen display
app.get("/kitchen", (req, res) => {
    res.render("kitchen");
});

// API route to get all orders for the kitchen display
app.get("/api/orders", async (req, res) => {
    try {
        const orders = await Cart.find().sort({ createdAt: -1 }); // Sort by createdAt in descending order
        res.json(orders);
    } catch (error) {
        console.error("Error fetching orders from MongoDB:", error);
        res.status(500).send("Internal Server Error");
    }
});

// API route to save earnings record
app.post('/api/save-earnings-record', async (req, res) => {
    try {
        const { date, totalEarnings } = req.body;
        const earningsRecord = await EarningsRecord.findOne({ date });

        if (earningsRecord) {
            earningsRecord.totalEarnings = totalEarnings;
            await earningsRecord.save();
        } else {
            const newEarningsRecord = new EarningsRecord({
                date,
                totalEarnings
            });
            await newEarningsRecord.save();
        }

        res.status(200).send('Record saved');
    } catch (error) {
        console.error('Error saving earnings record:', error);
        res.status(500).send('Internal Server Error');
    }
});

// API route to fetch earnings records
app.get('/api/earnings-records', async (req, res) => {
    try {
        const records = await EarningsRecord.find();
        res.json(records);
    } catch (error) {
        console.error('Error fetching earnings records:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Schedule a job to clear orders daily at midnight
cron.schedule('0 0 * * *', async () => {
    try {
        console.log("Clearing orders at midnight");
        await Cart.deleteMany({});
        console.log("All orders have been deleted");
    } catch (error) {
        console.error("Error clearing orders:", error);
    }
});

app.listen(port, () => {
    console.log(`Server is running at port ${port}`);
});

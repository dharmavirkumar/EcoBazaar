const cron = require("node-cron");
const axios = require("axios");
const Order = require("../models/Order");

cron.schedule("*/10 * * * *", async () => {
  console.log("🔄 Checking delivery updates...");

  try {
    const orders = await Order.find({
      courier: "Delhivery",
      status: { $ne: "Delivered" }
    });

    for (let order of orders) {
      if (!order.trackingId) continue;

      try {
        const response = await axios.get(
          `https://track.delhivery.com/api/v1/packages/json/?waybill=${order.trackingId}`,
          {
            headers: {
              Authorization: `Token ${process.env.DELHIVERY_API_KEY}`
            }
          }
        );

        const shipment =
          response.data?.ShipmentData?.[0]?.Shipment?.Status;

        if (!shipment) continue;

        const newStatus = shipment.Status;

        if (order.status !== newStatus) {
          order.status = newStatus;

          order.statusHistory.push({
            status: newStatus,
            date: new Date()
          });

          await order.save();

          console.log(`✅ Updated: ${order._id} → ${newStatus}`);
        }
      } catch (err) {
        console.log("Tracking error:", err.message);
      }
    }
  } catch (err) {
    console.log("CRON ERROR:", err.message);
  }
});
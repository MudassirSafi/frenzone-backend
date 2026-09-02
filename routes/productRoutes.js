const express = require("express");
const router = express.Router();

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const requireAuth = require("../middleware/requireAuth");
const {
  createProduct,
  getAllUserProducts,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

router.use(requireAuth);

router.post("/createProduct", upload.array("images"), createProduct);
router.get("/getAllUserProducts", getAllUserProducts);
router.get("/getAllProducts", getAllProducts);
router.get("/getProductById/:productId", getProductById);
router.patch("/updateProduct", upload.array("images"), updateProduct);
router.delete("/deleteProduct", deleteProduct);

module.exports = router;

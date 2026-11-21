import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  writeBatch,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy
} from "firebase/firestore";

export default function App() {
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);

  // حقول إضافة منتج جديد
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [stock, setStock] = useState("");

  // حالة تعديل منتج قائم
  const [editingProductId, setEditingProductId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editSize, setEditSize] = useState("");
  const [editCostPrice, setEditCostPrice] = useState("");
  const [editSellPrice, setEditSellPrice] = useState("");
  const [editStock, setEditStock] = useState("");

  // حقول الفاتورة الحالية
  const [customerName, setCustomerName] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [sellQty, setSellQty] = useState(1);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);

  // 1. الاستماع اللحظي للمنتجات في المخزون
  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(items);
    });
    return () => unsubscribe();
  }, []);

  // 2. الاستماع اللحظي للفواتير المسجلة
  useEffect(() => {
    const q = query(collection(db, "invoices"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setInvoices(list);
    });
    return () => unsubscribe();
  }, []);

  // إضافة منتج جديد للمخزون
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!name || !costPrice || !sellPrice || !stock) return;
    if (Number(stock) <= 0) {
      alert("الكمية يجب أن تكون أكبر من صفر!");
      return;
    }

    await addDoc(collection(db, "products"), {
      name: name.trim(),
      size: size.trim() || "موحد",
      costPrice: Number(costPrice),
      sellPrice: Number(sellPrice),
      stock: Number(stock),
      createdAt: serverTimestamp()
    });

    setName("");
    setSize("");
    setCostPrice("");
    setSellPrice("");
    setStock("");
  };

  // بدء تعديل منتج
  const startEditingProduct = (product) => {
    setEditingProductId(product.id);
    setEditName(product.name || "");
    setEditSize(product.size || "موحد");
    setEditCostPrice(product.costPrice ?? "");
    setEditSellPrice(product.sellPrice ?? "");
    setEditStock(product.stock ?? 0);
  };

  // إلغاء التعديل
  const cancelEditingProduct = () => {
    setEditingProductId(null);
    setEditName("");
    setEditSize("");
    setEditCostPrice("");
    setEditSellPrice("");
    setEditStock("");
  };

  // حفظ تعديل المنتج في Firestore (أو حذفه إذا جعل المستخدم الرصيد 0 أو أقل)
  const handleSaveProductEdit = async (productId) => {
    if (!editName.trim() || editCostPrice === "" || editSellPrice === "" || editStock === "") {
      alert("يرجى استكمال جميع بيانات المنتج قبل الحفظ.");
      return;
    }

    const updatedStock = Number(editStock);
    setLoading(true);
    try {
      const productRef = doc(db, "products", productId);
      if (updatedStock <= 0) {
        await deleteDoc(productRef);
        setCart((prev) => prev.filter((item) => item.id !== productId));
        alert("تم حذف المنتج لأن الرصيد أصبح صفراً.");
      } else {
        await updateDoc(productRef, {
          name: editName.trim(),
          size: editSize.trim() || "موحد",
          costPrice: Number(editCostPrice),
          sellPrice: Number(editSellPrice),
          stock: updatedStock
        });
        alert("تم تحديث بيانات المنتج بنجاح!");
      }
      cancelEditingProduct();
    } catch (error) {
      console.error("خطأ أثناء تعديل المنتج:", error);
      alert("حدث خطأ أثناء تعديل المنتج.");
    } finally {
      setLoading(false);
    }
  };

  // حذف منتج يدوياً من المخزون
  const handleDeleteProduct = async (product) => {
    if (!product?.id) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "products", product.id));
      setCart((prev) => prev.filter((item) => item.id !== product.id));
      if (editingProductId === product.id) {
        cancelEditingProduct();
      }
      alert(`تم حذف (${product.name}) من المخزون.`);
    } catch (error) {
      console.error("خطأ أثناء حذف المنتج:", error);
      alert("حدث خطأ أثناء حذف المنتج.");
    } finally {
      setLoading(false);
    }
  };

  // إضافة صنف إلى سلة الفاتورة الحالية
  const handleAddToCart = () => {
    if (!selectedProductId || sellQty <= 0) return;
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const existingInCart = cart.find((item) => item.id === product.id);
    const totalRequestedQty = (existingInCart ? existingInCart.qty : 0) + Number(sellQty);

    if (totalRequestedQty > product.stock) {
      alert(`الكمية المتاحة في المخزون من (${product.name}) هي ${product.stock} قطعة فقط!`);
      return;
    }

    if (existingInCart) {
      setCart(
        cart.map((item) =>
          item.id === product.id ? { ...item, qty: totalRequestedQty } : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          id: product.id,
          name: product.name,
          size: product.size,
          costPrice: product.costPrice,
          sellPrice: product.sellPrice,
          currentStock: product.stock,
          qty: Number(sellQty)
        }
      ]);
    }
    setSellQty(1);
  };

  // حذف صنف من الفاتورة قبل الاعتماد
  const removeFromCart = (id) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  // حساب إجماليات الفاتورة الحالية
  const cartTotalRevenue = cart.reduce((sum, item) => sum + item.sellPrice * item.qty, 0);
  const cartTotalCost = cart.reduce((sum, item) => sum + item.costPrice * item.qty, 0);
  const cartTotalProfit = cartTotalRevenue - cartTotalCost;

  // 3. اعتماد الفاتورة + خصم المخزون + مسح المنتهي تلقائياً
  const handleCompleteInvoice = async () => {
    if (cart.length === 0) return;
    setLoading(true);

    try {
      const batch = writeBatch(db);

      const invoiceRef = doc(collection(db, "invoices"));
      batch.set(invoiceRef, {
        customerName: customerName.trim() || "عميل نقدي",
        items: cart.map(({ id, name, size, qty, sellPrice, costPrice }) => ({
          productId: id,
          name,
          size,
          qty,
          sellPrice,
          costPrice,
          itemProfit: (sellPrice - costPrice) * qty
        })),
        totalRevenue: cartTotalRevenue,
        totalCost: cartTotalCost,
        netProfit: cartTotalProfit,
        createdAt: serverTimestamp()
      });

      cart.forEach((item) => {
        const productRef = doc(db, "products", item.id);
        const remainingStock = Number(item.currentStock) - Number(item.qty);

        if (remainingStock <= 0) {
          batch.delete(productRef);
        } else {
          batch.update(productRef, {
            stock: remainingStock
          });
        }
      });

      await batch.commit();

      setCart([]);
      setCustomerName("");
      setSelectedProductId("");
      alert("تم تسجيل الفاتورة وخصم المخزون وحساب الأرباح بنجاح!");
    } catch (error) {
      console.error("خطأ أثناء حفظ الفاتورة:", error);
      alert("حدث خطأ أثناء حفظ الفاتورة. تأكد من الاتصال بالإنترنت.");
    } finally {
      setLoading(false);
    }
  };

  // 4. حذف فاتورة + إرجاع الكميات المباعة إلى المخزون تلقائياً
  const handleDeleteInvoice = async (invoice) => {
    if (!invoice || !invoice.id) return;
    setLoading(true);

    try {
      const batch = writeBatch(db);

      for (const item of invoice.items || []) {
        if (!item.productId) continue;
        const productRef = doc(db, "products", item.productId);
        const productSnap = await getDoc(productRef);
        const qtyToRestore = Number(item.qty || 0);

        if (productSnap.exists()) {
          const currentStock = Number(productSnap.data().stock || 0);
          batch.update(productRef, {
            stock: currentStock + qtyToRestore
          });
        } else if (qtyToRestore > 0) {
          batch.set(productRef, {
            name: item.name || "منتج مسترجع",
            size: item.size || "موحد",
            costPrice: Number(item.costPrice || 0),
            sellPrice: Number(item.sellPrice || 0),
            stock: qtyToRestore,
            createdAt: serverTimestamp()
          });
        }
      }

      const invoiceRef = doc(db, "invoices", invoice.id);
      batch.delete(invoiceRef);

      await batch.commit();
      alert("تم حذف الفاتورة وإرجاع الكميات إلى المخزون بنجاح!");
    } catch (error) {
      console.error("خطأ أثناء حذف الفاتورة:", error);
      alert("حدث خطأ أثناء حذف الفاتورة.");
    } finally {
      setLoading(false);
    }
  };

  // حسابات لوحة الملخص العام
  const totalStockValueCost = products.reduce((sum, p) => sum + Number(p.costPrice || 0) * Number(p.stock || 0), 0);
  const totalStockPieces = products.reduce((sum, p) => sum + Number(p.stock || 0), 0);
  const overallSales = invoices.reduce((sum, inv) => sum + Number(inv.totalRevenue || 0), 0);
  const overallProfit = invoices.reduce((sum, inv) => sum + Number(inv.netProfit || 0), 0);

  return (
    <div dir="rtl" style={{ fontFamily: "Segoe UI, Tahoma, sans-serif", maxWidth: "1150px", margin: "0 auto", padding: "20px", backgroundColor: "#f8fafc", color: "#1e293b" }}>
      <h1 style={{ textAlign: "center", color: "#0f172a", marginBottom: "24px" }}>
        نظام إدارة المخزون والفواتير — قطن مصري
      </h1>

      {/* بطاقات الملخص المالي والمخزني */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "15px", marginBottom: "30px" }}>
        <div style={cardStyle}>
          <div style={cardLabel}>إجمالي القطع بالمخزون</div>
          <div style={cardValue}>{totalStockPieces} قطعة</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>قيمة المخزون (بالتكلفة)</div>
          <div style={cardValue}>{totalStockValueCost.toLocaleString()} ج.م</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>إجمالي المبيعات</div>
          <div style={{ ...cardValue, color: "#2563eb" }}>{overallSales.toLocaleString()} ج.م</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>صافي الأرباح المحققة</div>
          <div style={{ ...cardValue, color: "#16a34a" }}>{overallProfit.toLocaleString()} ج.م</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "30px" }}>
        {/* 1. إضافة منتج للمخزون */}
        <div style={sectionStyle}>
          <h2 style={sectionTitle}>1. إضافة بضاعة للمخزون</h2>
          <form onSubmit={handleAddProduct} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <input type="text" placeholder="اسم المنتج (مثال: ترينج قطن ميلتون)" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} required />
            <input type="text" placeholder="المقاس (مثال: L / XL)" value={size} onChange={(e) => setSize(e.target.value)} style={inputStyle} />
            <div style={{ display: "flex", gap: "10px" }}>
              <input type="number" placeholder="سعر التكلفة (ج.م)" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} style={inputStyle} required />
              <input type="number" placeholder="سعر البيع (ج.م)" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} style={inputStyle} required />
            </div>
            <input type="number" placeholder="الكمية المضافة" value={stock} onChange={(e) => setStock(e.target.value)} style={inputStyle} required />
            <button type="submit" style={primaryBtn}>+ إضافة للمخزون</button>
          </form>
        </div>

        {/* 2. إنشاء فاتورة بيع جديدة */}
        <div style={sectionStyle}>
          <h2 style={sectionTitle}>2. إنشاء فاتورة بيع جديدة</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <input type="text" placeholder="اسم العميل (اختياري)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={inputStyle} />

            <div style={{ display: "flex", gap: "10px" }}>
              <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} style={{ ...inputStyle, flex: 2 }}>
                <option value="">-- اختر الصنف من المخزون --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.size}) — المتاح: {p.stock} | السعر: {p.sellPrice} ج.م
                  </option>
                ))}
              </select>
              <input type="number" min="1" value={sellQty} onChange={(e) => setSellQty(e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="الكمية" />
            </div>

            <button type="button" onClick={handleAddToCart} style={secondaryBtn}>+ إضافة للفاتورة</button>

            {cart.length > 0 && (
              <div style={{ marginTop: "10px", borderTop: "1px solid #e2e8f0", paddingTop: "10px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f1f5f9", textAlign: "right" }}>
                      <th style={thStyle}>الصنف</th>
                      <th style={thStyle}>الكمية</th>
                      <th style={thStyle}>الإجمالي</th>
                      <th style={thStyle}>الربح</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={tdStyle}>{item.name} ({item.size})</td>
                        <td style={tdStyle}>{item.qty}</td>
                        <td style={tdStyle}>{item.sellPrice * item.qty} ج.م</td>
                        <td style={{ ...tdStyle, color: "#16a34a", fontWeight: "bold" }}>
                          +{(item.sellPrice - item.costPrice) * item.qty} ج.م
                        </td>
                        <td style={tdStyle}>
                          <button type="button" onClick={() => removeFromCart(item.id)} style={{ color: "#dc2626", border: "none", background: "none", cursor: "pointer" }}>حذف</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ marginTop: "12px", padding: "10px", backgroundColor: "#f0fdf4", borderRadius: "6px", display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
                  <span>إجمالي الفاتورة: {cartTotalRevenue} ج.م</span>
                  <span style={{ color: "#16a34a" }}>صافي ربح الفاتورة: {cartTotalProfit} ج.م</span>
                </div>

                <button type="button" onClick={handleCompleteInvoice} disabled={loading} style={{ ...successBtn, width: "100%", marginTop: "10px" }}>
                  {loading ? "جاري الحفظ والتحديث..." : "اعتماد الفاتورة وخصم المخزون"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. المخزون المتاح حالياً مع التعديل والحذف */}
      <div style={{ ...sectionStyle, marginBottom: "30px", overflowX: "auto" }}>
        <h2 style={sectionTitle}>3. المخزون المتاح حالياً (تعديل وحذف المنتجات + حذف المنتهي تلقائياً)</h2>
        {products.length === 0 ? (
          <p style={{ color: "#64748b", textAlign: "center" }}>لا توجد منتجات متاحة في المخزون حالياً.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f1f5f9", textAlign: "right" }}>
                <th style={thStyle}>اسم المنتج</th>
                <th style={thStyle}>المقاس</th>
                <th style={thStyle}>سعر التكلفة</th>
                <th style={thStyle}>سعر البيع</th>
                <th style={thStyle}>ربح القطعة</th>
                <th style={thStyle}>الرصيد المتبقي</th>
                <th style={thStyle}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const isEditing = editingProductId === p.id;
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={tdStyle}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={inlineInputStyle}
                        />
                      ) : (
                        p.name
                      )}
                    </td>
                    <td style={tdStyle}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editSize}
                          onChange={(e) => setEditSize(e.target.value)}
                          style={{ ...inlineInputStyle, width: "85px" }}
                        />
                      ) : (
                        p.size
                      )}
                    </td>
                    <td style={tdStyle}>
                      {isEditing ? (
                        <input
                          type="number"
                          value={editCostPrice}
                          onChange={(e) => setEditCostPrice(e.target.value)}
                          style={{ ...inlineInputStyle, width: "85px" }}
                        />
                      ) : (
                        `${p.costPrice} ج.م`
                      )}
                    </td>
                    <td style={tdStyle}>
                      {isEditing ? (
                        <input
                          type="number"
                          value={editSellPrice}
                          onChange={(e) => setEditSellPrice(e.target.value)}
                          style={{ ...inlineInputStyle, width: "85px" }}
                        />
                      ) : (
                        `${p.sellPrice} ج.م`
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: "#16a34a" }}>
                      {isEditing
                        ? `${Number(editSellPrice || 0) - Number(editCostPrice || 0)} ج.م`
                        : `${p.sellPrice - p.costPrice} ج.م`}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: "bold", color: p.stock <= 3 ? "#ea580c" : "#0f172a" }}>
                      {isEditing ? (
                        <input
                          type="number"
                          value={editStock}
                          onChange={(e) => setEditStock(e.target.value)}
                          style={{ ...inlineInputStyle, width: "75px" }}
                        />
                      ) : (
                        `${p.stock} قطعة`
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {isEditing ? (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            onClick={() => handleSaveProductEdit(p.id)}
                            disabled={loading}
                            style={saveSmallBtn}
                          >
                            حفظ
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingProduct}
                            disabled={loading}
                            style={cancelSmallBtn}
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            onClick={() => startEditingProduct(p)}
                            disabled={loading}
                            style={editSmallBtn}
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(p)}
                            disabled={loading}
                            style={deleteBtn}
                          >
                            حذف
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 4. سجل الفواتير السابقة والأرباح */}
      <div style={{ ...sectionStyle, overflowX: "auto" }}>
        <h2 style={sectionTitle}>4. سجل الفواتير السابقة والأرباح</h2>
        {invoices.length === 0 ? (
          <p style={{ color: "#64748b", textAlign: "center" }}>لم يتم تسجيل أي فواتير بعد.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f1f5f9", textAlign: "right" }}>
                <th style={thStyle}>العميل</th>
                <th style={thStyle}>الأصناف المباعة</th>
                <th style={thStyle}>إجمالي الفاتورة</th>
                <th style={thStyle}>التكلفة</th>
                <th style={thStyle}>صافي الربح</th>
                <th style={thStyle}>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={tdStyle}>{inv.customerName}</td>
                  <td style={tdStyle}>
                    {inv.items?.map((i, idx) => (
                      <div key={idx}>{i.name} ({i.size}) × {i.qty}</div>
                    ))}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: "bold" }}>{inv.totalRevenue} ج.م</td>
                  <td style={tdStyle}>{inv.totalCost} ج.م</td>
                  <td style={{ ...tdStyle, color: "#16a34a", fontWeight: "bold" }}>+{inv.netProfit} ج.م</td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => handleDeleteInvoice(inv)}
                      disabled={loading}
                      style={deleteBtn}
                    >
                      حذف الفاتورة
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const cardStyle = { backgroundColor: "#fff", padding: "18px", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", textAlign: "center" };
const cardLabel = { fontSize: "14px", color: "#64748b", marginBottom: "6px" };
const cardValue = { fontSize: "22px", fontWeight: "bold", color: "#0f172a" };
const sectionStyle = { backgroundColor: "#fff", padding: "20px", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const sectionTitle = { fontSize: "18px", marginBottom: "15px", color: "#0f172a", borderBottom: "2px solid #f1f5f9", paddingBottom: "8px" };
const inputStyle = { padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px", width: "100%", boxSizing: "border-box" };
const inlineInputStyle = { padding: "6px 8px", borderRadius: "5px", border: "1px solid #94a3b8", fontSize: "13px", boxSizing: "border-box" };
const primaryBtn = { padding: "10px", backgroundColor: "#0f172a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" };
const secondaryBtn = { padding: "10px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" };
const successBtn = { padding: "12px", backgroundColor: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "15px" };
const editSmallBtn = { padding: "6px 10px", backgroundColor: "#0284c7", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" };
const saveSmallBtn = { padding: "6px 10px", backgroundColor: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" };
const cancelSmallBtn = { padding: "6px 10px", backgroundColor: "#64748b", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" };
const deleteBtn = { padding: "6px 12px", backgroundColor: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" };
const thStyle = { padding: "10px", borderBottom: "2px solid #e2e8f0" };
const tdStyle = { padding: "10px" };
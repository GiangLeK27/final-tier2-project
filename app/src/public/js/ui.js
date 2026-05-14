/* global document, window, bootstrap, fetch, FormData, FileReader */

document.addEventListener("DOMContentLoaded", () => {
  const addButton = document.getElementById("btn-add");
  const tableBody = document.getElementById("product-table");
  const modalElement = document.getElementById("productModal");
  const productForm = document.getElementById("product-form");

  const modalTitle = document.getElementById("modalTitle");
  const productIdInput = document.getElementById("product-id");
  const nameInput = document.getElementById("name");
  const priceInput = document.getElementById("price");
  const colorInput = document.getElementById("color");
  const descriptionInput = document.getElementById("description");
  const imageFileInput = document.getElementById("imageFile");
  const imagePreview = document.getElementById("img-preview");

  if (!modalElement || !productForm || !addButton || !tableBody) {
    return;
  }

  const modal = new bootstrap.Modal(modalElement);
  const placeholderImage = "/images/placeholder-80.svg";

  function resetForm() {
    productForm.reset();
    productIdInput.value = "";
    imagePreview.src = placeholderImage;
  }

  function openAddModal() {
    resetForm();
    modalTitle.textContent = "Add Product";
    modal.show();
  }

  function openEditModal(row) {
    resetForm();

    const cells = row.querySelectorAll("td");

    productIdInput.value = row.dataset.id || "";
    nameInput.value = cells[1]?.textContent.trim() || "";
    priceInput.value = cells[2]?.textContent.trim() || "";
    colorInput.value = cells[3]?.textContent.trim() || "";
    descriptionInput.value = cells[4]?.textContent.trim() || "";

    const currentImage = row.dataset.image || "";
    imagePreview.src = currentImage || placeholderImage;

    modalTitle.textContent = "Edit Product";
    modal.show();
  }

  async function deleteProduct(productId) {
    const confirmed = window.confirm("Delete this product?");

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/products/${productId}`, {
        method: "DELETE"
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        alert(result.message || "Delete failed");
        return;
      }

      window.location.reload();
    } catch (_error) {
      alert("Delete failed");
    }
  }

  addButton.addEventListener("click", openAddModal);

  tableBody.addEventListener("click", (event) => {
    const target = event.target;
    const row = target.closest("tr");

    if (!row) {
      return;
    }

    if (target.classList.contains("btn-edit")) {
      openEditModal(row);
      return;
    }

    if (target.classList.contains("btn-delete")) {
      const productId = row.dataset.id;

      if (productId) {
        deleteProduct(productId);
      }
    }
  });

  productForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const productId = productIdInput.value.trim();

    const name = nameInput.value.trim();
    const price = priceInput.value.trim();
    const color = colorInput.value.trim();
    const description = descriptionInput.value.trim();

    if (!name || !price || !color) {
      alert("Please enter name, price, and color.");
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("price", price);
    formData.append("color", color);
    formData.append("description", description);

    const selectedFile = imageFileInput.files[0];

    if (selectedFile) {
      formData.append("imageFile", selectedFile);
    }

    const requestUrl = productId
      ? `/products/${productId}`
      : "/products";

    const requestMethod = productId ? "PATCH" : "POST";

    try {
      const response = await fetch(requestUrl, {
        method: requestMethod,
        body: formData
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        if (Array.isArray(result.errors)) {
          alert(result.errors.map((error) => error.msg).join("\n"));
          return;
        }

        alert(result.message || "Save failed");
        return;
      }

      window.location.reload();
    } catch (_error) {
      alert("Save failed");
    }
  });

  imageFileInput.addEventListener("change", () => {
    const file = imageFileInput.files[0];

    if (!file) {
      imagePreview.src = placeholderImage;
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      imagePreview.src = event.target.result;
    };

    reader.readAsDataURL(file);
  });
});
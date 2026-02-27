defmodule LiveBettingWeb.WalletTransactionLive.Form do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Accounts
  alias LiveBetting.Accounts.WalletTransaction

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        {@page_title}
        <:subtitle>Use this form to manage wallet_transaction records in your database.</:subtitle>
      </.header>

      <.form for={@form} id="wallet_transaction-form" phx-change="validate" phx-submit="save">
        <.input field={@form[:type]} type="text" label="Type" />
        <.input field={@form[:amount]} type="number" label="Amount" step="any" />
        <.input field={@form[:balance_after]} type="number" label="Balance after" step="any" />
        <footer>
          <.button phx-disable-with="Saving..." variant="primary">Save Wallet transaction</.button>
          <.button navigate={return_path(@return_to, @wallet_transaction)}>Cancel</.button>
        </footer>
      </.form>
    </Layouts.app>
    """
  end

  @impl true
  def mount(params, _session, socket) do
    {:ok,
     socket
     |> assign(:return_to, return_to(params["return_to"]))
     |> apply_action(socket.assigns.live_action, params)}
  end

  defp return_to("show"), do: "show"
  defp return_to(_), do: "index"

  defp apply_action(socket, :edit, %{"id" => id}) do
    wallet_transaction = Accounts.get_wallet_transaction!(id)

    socket
    |> assign(:page_title, "Edit Wallet transaction")
    |> assign(:wallet_transaction, wallet_transaction)
    |> assign(:form, to_form(Accounts.change_wallet_transaction(wallet_transaction)))
  end

  defp apply_action(socket, :new, _params) do
    wallet_transaction = %WalletTransaction{}

    socket
    |> assign(:page_title, "New Wallet transaction")
    |> assign(:wallet_transaction, wallet_transaction)
    |> assign(:form, to_form(Accounts.change_wallet_transaction(wallet_transaction)))
  end

  @impl true
  def handle_event("validate", %{"wallet_transaction" => wallet_transaction_params}, socket) do
    changeset = Accounts.change_wallet_transaction(socket.assigns.wallet_transaction, wallet_transaction_params)
    {:noreply, assign(socket, form: to_form(changeset, action: :validate))}
  end

  def handle_event("save", %{"wallet_transaction" => wallet_transaction_params}, socket) do
    save_wallet_transaction(socket, socket.assigns.live_action, wallet_transaction_params)
  end

  defp save_wallet_transaction(socket, :edit, wallet_transaction_params) do
    case Accounts.update_wallet_transaction(socket.assigns.wallet_transaction, wallet_transaction_params) do
      {:ok, wallet_transaction} ->
        {:noreply,
         socket
         |> put_flash(:info, "Wallet transaction updated successfully")
         |> push_navigate(to: return_path(socket.assigns.return_to, wallet_transaction))}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  defp save_wallet_transaction(socket, :new, wallet_transaction_params) do
    case Accounts.create_wallet_transaction(wallet_transaction_params) do
      {:ok, wallet_transaction} ->
        {:noreply,
         socket
         |> put_flash(:info, "Wallet transaction created successfully")
         |> push_navigate(to: return_path(socket.assigns.return_to, wallet_transaction))}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  defp return_path("index", _wallet_transaction), do: ~p"/wallet_transactions"
  defp return_path("show", wallet_transaction), do: ~p"/wallet_transactions/#{wallet_transaction}"
end
